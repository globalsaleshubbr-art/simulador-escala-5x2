"""Serviço de escala 5x2 — FastAPI + Google OR-Tools CP-SAT + SQLite.

Endpoints
  GET    /api/health              estado do serviço
  GET    /api/stores              todas as lojas (JSON completo)
  GET    /api/stores/{id}         uma loja
  PUT    /api/stores/{id}         grava/atualiza uma loja
  DELETE /api/stores/{id}         remove uma loja
  POST   /api/solve               resolve a escala de um setor (SolveProblem -> linhas de códigos)

Restrições obrigatórias (hard) e preferências (objetivo) ficam separadas em `solve_problem`.
Quando não há solução, um modelo relaxado identifica quais grupos de restrições precisam mudar.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from contextlib import closing
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ortools.sat.python import cp_model
from pydantic import BaseModel

DB_PATH = os.environ.get("ESCALA_DB", os.path.join(os.path.dirname(__file__), "escala.db"))
WEEKDAY = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]
INT_W = [0, 10, 20, 32]  # peso por intensidade de movimento (1 fraco, 2 médio, 3 forte)

app = FastAPI(title="Escala 5x2 — serviço de otimização", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------- persistência
def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.execute(
        "CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, network TEXT, name TEXT, data TEXT NOT NULL, updated_at TEXT)"
    )
    return con


@app.get("/api/health")
def health() -> dict[str, Any]:
    from ortools import __version__ as ortools_version

    return {"ok": True, "solver": "OR-Tools CP-SAT", "ortools": ortools_version, "db": os.path.basename(DB_PATH)}


@app.get("/api/stores")
def list_stores() -> list[dict[str, Any]]:
    with closing(db()) as con:
        rows = con.execute("SELECT data FROM stores ORDER BY network, name").fetchall()
    return [json.loads(r[0]) for r in rows]


@app.get("/api/stores/{store_id}")
def get_store(store_id: str) -> dict[str, Any]:
    with closing(db()) as con:
        row = con.execute("SELECT data FROM stores WHERE id = ?", (store_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Loja não encontrada")
    return json.loads(row[0])


@app.put("/api/stores/{store_id}")
def put_store(store_id: str, store: dict[str, Any]) -> dict[str, Any]:
    if store.get("id") != store_id:
        raise HTTPException(400, "id do corpo difere da URL")
    with closing(db()) as con, con:
        con.execute(
            "INSERT INTO stores (id, network, name, data, updated_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET network=excluded.network, name=excluded.name, data=excluded.data, updated_at=excluded.updated_at",
            (store_id, store.get("network", ""), store.get("name", ""), json.dumps(store, ensure_ascii=False), store.get("updatedAt", "")),
        )
    return {"ok": True}


@app.delete("/api/stores/{store_id}")
def delete_store(store_id: str) -> dict[str, Any]:
    with closing(db()) as con, con:
        con.execute("DELETE FROM stores WHERE id = ?", (store_id,))
    return {"ok": True}


# ---------------------------------------------------------------- otimização
class SolveRequest(BaseModel):
    problem: dict[str, Any]
    hint: list[list[str]] | None = None
    timeLimit: float = 10.0


def _is_unavailable(c: str | None) -> bool:
    return c in ("A", "M", "V", "H")


def required_folgas(p: dict, fixed: list, w: int, folgas: int | None = None) -> int:
    """Igual ao motor do navegador: semana toda definida usa as folgas que já estão lá; folgas da pessoa
    (jornada, 5x2/6x1 próprio); feriado com a loja fechada pode contar como uma das folgas."""
    wk = fixed[w * 7 : w * 7 + 7]
    if len(wk) == 7 and all(c is not None for c in wk):
        return sum(1 for c in wk if c == "F")
    unavailable = sum(1 for c in wk if _is_unavailable(c))
    feriados = sum(1 for c in wk if c == "H")
    f = p["folgas"] if folgas is None else folgas
    if p.get("feriadoFolga"):
        f = max(0, f - feriados)
    return max(0, min(f, 7 - unavailable))


def build_model(p: dict, hint: list[list[str]] | None, relaxed: bool):
    m = cp_model.CpModel()
    days = p["days"]
    emps = p["employees"]
    nD, nE = len(days), len(emps)
    nS = len(p["axis"])
    x: list[list[Any]] = []  # 1 = trabalha
    slacks: list[tuple[Any, str]] = []

    def slack(name: str, ub: int, msg: str):
        v = m.NewIntVar(0, ub, name)
        slacks.append((v, msg))
        return v

    for ei, e in enumerate(emps):
        row = []
        for d in range(nD):
            f = e["fixed"][d]
            if f in ("T", "D"):
                row.append(1)
            elif f is not None or days[d]["closed"]:
                row.append(0)
            else:
                v = m.NewBoolVar(f"x_{ei}_{d}")
                if hint:
                    m.AddHint(v, 1 if hint[ei][d] in ("T", "D") else 0)
                row.append(v)
        x.append(row)

    def F(ei: int, d: int):
        """1 se folga (F) no dia — dias de férias/ausência/feriado fechado não contam como folga."""
        f = emps[ei]["fixed"][d]
        if _is_unavailable(f):
            return 0
        return 1 - x[ei][d]

    # --- restrições obrigatórias
    for ei, e in enumerate(emps):
        name = e["name"]
        for w in range(p["weeks"]):
            if e.get("plantao"):
                continue
            need = required_folgas(p, e["fixed"], w, e.get("folgas"))
            fixed_f = sum(1 for d in range(w * 7, w * 7 + 7) if e["fixed"][d] == "F")
            folgas = sum(F(ei, d) for d in range(w * 7, w * 7 + 7))
            if relaxed:
                s = slack(f"sf_{ei}_{w}", 7, f"{name}: não foi possível dar {need} folga(s) na semana {w + 1}.")
                m.Add(folgas + s >= need)
            else:
                m.Add(folgas >= need)
            m.Add(folgas <= max(need, fixed_f))
            mins = sum(e["workMin"][d] * x[ei][d] for d in range(w * 7, w * 7 + 7))
            if relaxed:
                s = slack(f"sh_{ei}_{w}", 10000, f"{name}: semana {w + 1} ultrapassa o limite semanal de horas.")
                m.Add(mins <= p["weeklyMaxMin"] + s)
            else:
                m.Add(mins <= p["weeklyMaxMin"])
        mc = p["maxConsec"]
        for d in range(0, nD - mc):
            window = sum(x[ei][k] for k in range(d, d + mc + 1))
            if relaxed:
                s = slack(f"sc_{ei}_{d}", 7, f"{name}: mais de {mc} dias seguidos de trabalho.")
                m.Add(window <= mc + s)
            else:
                m.Add(window <= mc)
        N = e.get("sundayWindow")
        if N:
            sundays = [d for d in range(nD) if days[d]["weekday"] == 0 and not days[d]["closed"]]
            for k in range(0, len(sundays) - N + 1):
                offs = sum(1 - x[ei][d] for d in sundays[k : k + N])
                if relaxed:
                    s = slack(f"ss_{ei}_{k}", N, f"{name}: rodízio de domingos (1 a cada {N}) não pode ser cumprido.")
                    m.Add(offs + s >= 1)
                else:
                    m.Add(offs >= 1)
        if e.get("fixedOffWeekday") is not None:
            for d in range(nD):
                if days[d]["weekday"] == e["fixedOffWeekday"] and e["fixed"][d] is None and not days[d]["closed"]:
                    if relaxed:
                        s = slack(f"sfx_{ei}_{d}", 1, f"{name}: folga fixa de {WEEKDAY[e['fixedOffWeekday']]} não pode ser mantida.")
                        m.Add(x[ei][d] <= s)
                    else:
                        m.Add(x[ei][d] == 0)

    for d, day in enumerate(days):
        if day["closed"]:
            continue
        label = f"{WEEKDAY[day['weekday']]} {day['date'][8:10]}/{day['date'][5:7]}"
        if day.get("maxOff") is not None:
            offs = sum(1 if emps[ei]["fixed"][d] == "F" else (0 if emps[ei]["fixed"][d] is not None else 1 - x[ei][d]) for ei in range(nE))
            if relaxed:
                s = slack(f"smo_{d}", nE, f"{label}: o limite de {day['maxOff']} folga(s) no dia não pode ser respeitado.")
                m.Add(offs <= day["maxOff"] + s)
            else:
                m.Add(offs <= day["maxOff"])
        if day.get("minStaff") is not None:
            work = sum(x[ei][d] for ei in range(nE))
            if relaxed:
                s = slack(f"sms_{d}", nE, f"{label}: o mínimo diário de {day['minStaff']} pessoa(s) não pode ser atendido.")
                m.Add(work + s >= day["minStaff"])
            else:
                m.Add(work >= day["minStaff"])

    # --- objetivo: déficit de cobertura ponderado pelo movimento + preferências
    terms = []
    contrib_idx = [[set(e["contrib"][d]) for d in range(nD)] for e in emps]
    for d, day in enumerate(days):
        if day["closed"]:
            continue
        W = INT_W[day["intensity"]] if 0 <= day["intensity"] < len(INT_W) else 20
        for s in range(nS):
            req = day["req"][s]
            ideal = day["ideal"][s]
            if req <= 0 and ideal <= 0:
                continue
            cov = p["external"][d][s] + sum(x[ei][d] for ei in range(nE) if s in contrib_idx[ei][d])
            if req > 0:
                dv = m.NewIntVar(0, req, f"def_{d}_{s}")
                m.Add(dv >= req - cov)
                terms.append(W * 10 * dv)
            if ideal > 0:
                iv = m.NewIntVar(0, ideal, f"idf_{d}_{s}")
                m.Add(iv >= ideal - cov)
                terms.append(W * iv)
        for ei, e in enumerate(emps):
            if e["fixed"][d] is None:
                terms.append(day["intensity"] * 6 * (1 - x[ei][d]))
                if e.get("prefWeekday") is not None and day["weekday"] == e["prefWeekday"]:
                    terms.append(-15 * (1 - x[ei][d]))
    if relaxed:
        m.Minimize(sum(1_000_000 * s for s, _ in slacks) + sum(terms))
    else:
        m.Minimize(sum(terms))
    return m, x, slacks


def _value(solver: cp_model.CpSolver, v: Any) -> int:
    return v if isinstance(v, int) else solver.Value(v)


def rows_from(solver: cp_model.CpSolver, p: dict, x: list[list[Any]]) -> list[list[str]]:
    out = []
    for ei, e in enumerate(p["employees"]):
        row = []
        for d, day in enumerate(p["days"]):
            f = e["fixed"][d]
            if f is not None:
                row.append(f)
            elif day["closed"]:
                row.append("F")
            else:
                row.append(("D" if day["special"] else "T") if _value(solver, x[ei][d]) else "F")
        out.append(row)
    return out


def solve_problem(p: dict, hint: list[list[str]] | None = None, time_limit: float = 10.0) -> dict[str, Any]:
    t0 = time.time()
    m, x, _ = build_model(p, hint, relaxed=False)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = 8
    status = solver.Solve(m)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "ok": True,
            "status": solver.StatusName(status),
            "rows": rows_from(solver, p, x),
            "objective": solver.ObjectiveValue(),
            "explanations": [],
            "ms": int((time.time() - t0) * 1000),
        }
    # sem solução: modelo relaxado mostra o que precisa ser ajustado
    m2, x2, slacks = build_model(p, hint, relaxed=True)
    s2 = cp_model.CpSolver()
    s2.parameters.max_time_in_seconds = time_limit
    s2.parameters.num_workers = 8
    st2 = s2.Solve(m2)
    explanations: list[str] = []
    if st2 in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        seen = set()
        for v, msg in slacks:
            if s2.Value(v) > 0 and msg not in seen:
                seen.add(msg)
                explanations.append(msg)
    return {
        "ok": False,
        "status": solver.StatusName(status),
        "rows": rows_from(s2, p, x2) if st2 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        "objective": None,
        "explanations": explanations[:30] or ["O modelo não tem solução com as restrições atuais."],
        "ms": int((time.time() - t0) * 1000),
    }


@app.post("/api/solve")
def solve(req: SolveRequest) -> dict[str, Any]:
    return solve_problem(req.problem, req.hint, min(max(req.timeLimit, 1.0), 60.0))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
