"use client";
// Almoços em dia (modelo 2): quando turnos, equipe, folgas ou o período de um setor mudam, o sistema
// sugere horário para quem ainda não tem, aplica o rodízio e os domingos — sem passar por cima do que você escolheu.
import { useEffect, useMemo, useRef } from "react";
import { useSim } from "../components/state";
import { almocosEmDia, assinaturaAlmoco2 } from "../engine/almoco";
import type { Sector, Store } from "../engine/types";

export function useAlmocosEmDia(pares: { st: Store; sec: Sector | null | undefined }[]) {
  const sim = useSim();
  const feitos = useRef(new Set<string>());
  // só recalcula as assinaturas quando os dados mudam (vale para todas as lojas e setores de uma vez)
  const todos = useMemo(
    () =>
      pares
        .filter((p): p is { st: Store; sec: Sector } => !!p.sec && p.st.employees.some((e) => e.sectorId === p.sec!.id))
        .map((p) => ({ ...p, ass: assinaturaAlmoco2(p.st, p.sec.id) }))
        .filter((p) => p.sec.almocoAssinatura !== p.ass),
    [pares],
  );
  const pendentes = todos.filter((p) => !feitos.current.has(`${p.st.id}|${p.sec.id}|${p.ass}`));
  const chave = pendentes.map((p) => `${p.st.id}|${p.sec.id}|${p.ass}`).join(",");
  useEffect(() => {
    if (!pendentes.length || sim.running) return;
    // espera um pouco: várias mudanças seguidas (ex.: digitar um horário) viram uma passada só
    const t = setTimeout(() => {
      let novos = 0;
      for (const p of pendentes) {
        feitos.current.add(`${p.st.id}|${p.sec.id}|${p.ass}`);
        const r = almocosEmDia(p.st, p.sec.id);
        novos += r.novos;
        sim.updateStoreById(
          p.st.id,
          (x) => ({
            ...x,
            employees: x.employees.map((e) => (e.sectorId === p.sec.id ? r.store.employees.find((y) => y.id === e.id) ?? e : e)),
            sectors: x.sectors.map((s) => (s.id === p.sec.id ? r.store.sectors.find((y) => y.id === p.sec.id)! : s)),
          }),
          { semHistorico: true },
        );
      }
      // não cobre outro aviso na tela (ex.: o "Desfazer" de limpar a escala)
      if (novos && !sim.toast) sim.setToast(`Horário de almoço sugerido para ${novos} ${novos === 1 ? "pessoa" : "pessoas"} (dá para mudar na Escala de Almoço).`);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, sim.running]);
}

/** Nome antigo (telas que já chamavam): mesmo comportamento. */
export const useAlmocoAutomatico = useAlmocosEmDia;
