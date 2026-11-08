"use client";
// Regra 8b (quem cobre a folga de quem) sempre em dia: quando a folga do titular ou do substituto muda
// (à mão, por troca, férias…), o substituto vai para o turno certo na hora — sem precisar gerar a escala de novo.
import { useEffect, useMemo, useRef } from "react";
import { useSim } from "../components/state";
import { ajustarTurnos } from "../engine/turnos";
import { configDoSetor } from "../engine/regrasSetor";
import { buildDays, cellCode } from "../engine/model";
import type { Sector, Store } from "../engine/types";

/** O que define a cobertura do setor: duplas, período, turnos e os dias (código e turno escolhido à mão) de cada dupla. */
export function assinaturaCobertura(st: Store, sec: Sector): string {
  const r = configDoSetor(st.config, sec).regras;
  const ids = new Set(st.employees.filter((e) => e.sectorId === sec.id).map((e) => e.id));
  const pares = (r?.cobrirFolga?.pares ?? []).filter(([a, b]) => a !== b && ids.has(a) && ids.has(b));
  if (!pares.length) return "nenhuma";
  const days = buildDays(st.config);
  const pessoas = Array.from(new Set(pares.flat()));
  const dados = {
    p: pares,
    a: !!r?.cobrirFolga?.ausencias,
    c: [st.config.startDate, st.config.weeks],
    t: sec.shifts.map((s) => [s.id, s.special ?? false]),
    s: sec.defaultSundayShiftId ?? null,
    e: pessoas.map((id) => {
      const e = st.employees.find((x) => x.id === id)!;
      const row = sec.schedule[id] ?? {};
      return [id, e.shiftId, e.sundayShiftId ?? null, days.map((d) => cellCode(sec, id, d) + (row[d.date]?.shiftId && !row[d.date]?.auto ? row[d.date]!.shiftId : "")).join("")];
    }),
  };
  const txt = JSON.stringify(dados);
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
  return `c1:${txt.length}:${(h >>> 0).toString(36)}`;
}

export function useCoberturaEmDia(stores: Store[]) {
  const sim = useSim();
  const feitos = useRef(new Set<string>());
  const pendentes = useMemo(
    () =>
      stores.flatMap((st) =>
        st.sectors
          .map((sec) => ({ st, sec, ass: assinaturaCobertura(st, sec) }))
          // sem regra e nada aplicado antes: nada a fazer
          .filter((p) => p.ass !== (p.sec.coberturaAssinatura ?? "nenhuma")),
      ),
    [stores],
  );
  const chave = pendentes.map((p) => `${p.st.id}|${p.sec.id}|${p.ass}`).join(",");
  useEffect(() => {
    const fazer = pendentes.filter((p) => !feitos.current.has(`${p.st.id}|${p.sec.id}|${p.ass}`));
    if (!fazer.length || sim.running) return;
    const t = setTimeout(() => {
      for (const p of fazer) {
        feitos.current.add(`${p.st.id}|${p.sec.id}|${p.ass}`);
        const tur = ajustarTurnos(p.st, p.sec.id);
        const novo = tur.store.sectors.find((s) => s.id === p.sec.id)!;
        sim.updateStoreById(p.st.id, (x) => ({ ...x, sectors: x.sectors.map((s) => (s.id === p.sec.id ? { ...s, schedule: novo.schedule, coberturaAssinatura: p.ass } : s)) }), { semHistorico: true });
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, sim.running]);
}
