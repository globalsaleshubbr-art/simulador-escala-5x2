"""Testes do serviço: persistência SQLite e otimização CP-SAT (restrições obrigatórias x preferências)."""
import copy
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["ESCALA_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

from fastapi.testclient import TestClient  # noqa: E402

import app as service  # noqa: E402

client = TestClient(service.app)
HERE = os.path.dirname(__file__)
PROBLEM = json.load(open(os.path.join(HERE, "caixa_problem.json"), encoding="utf-8"))


def is_work(c):
    return c in ("T", "D")


def check_hard(p, rows):
    """Reimplementa as restrições obrigatórias para conferir a resposta do solver."""
    errs = []
    days = p["days"]
    for ei, e in enumerate(p["employees"]):
        row = rows[ei]
        for d, f in enumerate(e["fixed"]):
            if f is not None:
                assert row[d] == f, f"célula fixa alterada ({e['name']} dia {d})"
        for w in range(p["weeks"]):
            need = service.required_folgas(p, e["fixed"], w)
            folgas = sum(1 for d in range(w * 7, w * 7 + 7) if row[d] == "F")
            if folgas < need:
                errs.append(f"{e['name']} semana {w} com {folgas} folgas")
            mins = sum(e["workMin"][d] for d in range(w * 7, w * 7 + 7) if is_work(row[d]))
            if mins > p["weeklyMaxMin"]:
                errs.append("horas")
        run = 0
        for d in range(len(days)):
            run = run + 1 if is_work(row[d]) else 0
            if run > p["maxConsec"]:
                errs.append(f"{e['name']} {run} dias seguidos")
    for d, day in enumerate(days):
        if day["closed"]:
            continue
        off = sum(1 for r in rows if r[d] == "F")
        if day.get("maxOff") is not None and off > day["maxOff"]:
            errs.append(f"dia {d}: {off} folgas > {day['maxOff']}")
    return errs


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_store_crud_roundtrip():
    store = {"id": "loja_teste", "name": "Loja Teste", "network": "Rede", "updatedAt": "2026-10-19T00:00:00Z", "sectors": [], "employees": []}
    assert client.put("/api/stores/loja_teste", json=store).status_code == 200
    assert client.get("/api/stores/loja_teste").json()["name"] == "Loja Teste"
    store["name"] = "Loja Renomeada"
    client.put("/api/stores/loja_teste", json=store)
    lst = client.get("/api/stores").json()
    assert [s["name"] for s in lst if s["id"] == "loja_teste"] == ["Loja Renomeada"]
    client.delete("/api/stores/loja_teste")
    assert client.get("/api/stores/loja_teste").status_code == 404


def test_solve_respects_hard_constraints():
    r = client.post("/api/solve", json={"problem": PROBLEM, "timeLimit": 10})
    res = r.json()
    assert res["ok"] is True
    assert check_hard(PROBLEM, res["rows"]) == []


def test_locked_cell_is_kept():
    p = copy.deepcopy(PROBLEM)
    # trava folga num sábado (dia 6) para a primeira pessoa que estaria livre
    e = next(x for x in p["employees"] if x["fixed"][6] is None)
    e["fixed"][6] = "F"
    res = service.solve_problem(p, None, 10)
    assert res["ok"] is True
    idx = p["employees"].index(e)
    assert res["rows"][idx][6] == "F"
    assert check_hard(p, res["rows"]) == []


def test_infeasible_is_explained_not_faked():
    p = copy.deepcopy(PROBLEM)
    for d in p["days"]:
        d["maxOff"] = 1  # 17 pessoas não cabem com no máximo 1 folga por dia
    res = service.solve_problem(p, None, 10)
    assert res["ok"] is False
    assert any("limite" in x for x in res["explanations"])


def test_more_staff_on_strong_days():
    """Com movimento forte no sábado, o sábado recebe menos folgas que a terça (fraca)."""
    res = service.solve_problem(PROBLEM, None, 10)
    days = PROBLEM["days"]
    sat = [d for d, x in enumerate(days) if x["weekday"] == 6]
    tue = [d for d, x in enumerate(days) if x["weekday"] == 2]
    off = lambda ds: sum(1 for r in res["rows"] for d in ds if r[d] == "F")
    assert off(sat) < off(tue)
