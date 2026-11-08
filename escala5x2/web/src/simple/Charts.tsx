"use client";
import React, { useMemo, useState } from "react";
import { useSim } from "../components/state";
import { Select } from "../components/ui";
import { Card, CardTitle } from "./SimpleApp";
import { fmtNum } from "../engine/time";
import { useStoreScope } from "./StoreScope";

/** Paleta categórica validada (daltonismo e visão normal) — usada nos setores e nos gráficos, sempre na mesma ordem. */
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const OTHER = "#8a8796";

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** No máximo 8 fatias; o restante vira "Outros". */
function fold(list: Slice[]): Slice[] {
  const pos = list.filter((s) => s.value > 0);
  if (pos.length <= 8) return pos;
  const keep = pos.slice(0, 7);
  const rest = pos.slice(7).reduce((a, s) => a + s.value, 0);
  return [...keep, { key: "outros", label: `Outros (${pos.length - 7})`, value: rest, color: OTHER }];
}

function Pie({ title, slices, empty }: { title: string; slices: Slice[]; empty: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const R = 96;
  const C = 110;
  let acc = 0;
  const arcs = slices.map((s) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.value;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number) => `${C + R * Math.cos(a)} ${C + R * Math.sin(a)}`;
    const d = slices.length === 1 ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z` : `M ${C} ${C} L ${p(a0)} A ${R} ${R} 0 ${large} 1 ${p(a1)} Z`;
    return { s, d };
  });
  const h = slices.find((s) => s.key === hover);
  return (
    <div className="min-w-0">
      <h3 className="text-[15px] font-bold">{title}</h3>
      <p className="mt-0.5 mb-4 text-[13px] text-muted tnum" aria-live="polite">
        {h ? `${h.label}: ${h.value} ${h.value === 1 ? "colaborador" : "colaboradores"} (${fmtNum((h.value / total) * 100, 0)}%)` : `${total} ${total === 1 ? "colaborador" : "colaboradores"} no total`}
      </p>
      {!total ? (
        <p className="text-[13.5px] text-muted">{empty}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 220 220" width="220" height="220" role="img" aria-label={`${title}: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`} className="shrink-0 max-w-full">
            {arcs.map(({ s, d }) => (
              <path
                key={s.key}
                d={d}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
                strokeLinejoin="round"
                opacity={hover && hover !== s.key ? 0.35 : 1}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "default", transition: "opacity .15s" }}
              >
                <title>{`${s.label}: ${s.value} (${fmtNum((s.value / total) * 100, 0)}%)`}</title>
              </path>
            ))}
          </svg>
          <table className="text-[13.5px] tnum min-w-[220px] flex-1">
            <tbody>
              {slices.map((s) => (
                <tr key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} className={hover === s.key ? "bg-surface-2" : ""}>
                  <td className="py-1.5 pr-2">
                    <span className="inline-block h-3 w-3 rounded-sm align-middle" style={{ background: s.color }} aria-hidden />
                  </td>
                  <td className="py-1.5 pr-4 text-ink">{s.label}</td>
                  <td className="py-1.5 pr-3 text-right font-bold text-ink">{s.value}</td>
                  <td className="py-1.5 text-right text-muted">{fmtNum((s.value / total) * 100, 0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PeopleCharts() {
  const sim = useSim();
  const [group, setGroup] = useState<"setor" | "funcao">("setor");
  const [split, setSplit] = useState<"somadas" | "separadas">("somadas");
  const sc = useStoreScope("pie-scope");
  const stores = sc.stores;
  const multi = stores.length > 1;
  const slicesOf = useMemo(
    () => (list: typeof stores) => {
      const map = new Map<string, Slice>();
      let idx = 0;
      for (const st of list)
        for (const sec of st.sectors) {
          const emps = st.employees.filter((e) => e.sectorId === sec.id);
          if (!emps.length) continue;
          if (group === "setor") {
            const cur = map.get(sec.name);
            if (cur) cur.value += emps.length;
            else map.set(sec.name, { key: sec.name, label: sec.name, value: emps.length, color: sec.color ?? CATEGORICAL[idx++ % CATEGORICAL.length] });
          } else
            for (const e of emps) {
              const f = e.func.trim() || "Sem função";
              const cur = map.get(f);
              if (cur) cur.value++;
              else map.set(f, { key: f, label: f, value: 1, color: "" });
            }
        }
      const out = Array.from(map.values());
      if (group === "funcao") out.sort((a, b) => b.value - a.value).forEach((s, i) => (s.color = CATEGORICAL[i % CATEGORICAL.length]));
      return fold(out);
    },
    [group],
  );
  const groups = multi && split === "separadas" ? stores.map((st) => ({ id: st.id, title: st.name, slices: slicesOf([st]) })) : [{ id: "all", title: multi ? `${stores.length} lojas somadas` : stores[0]?.name ?? "", slices: slicesOf(stores) }];
  return (
    <Card>
      <CardTitle
        sub="Passe o mouse numa fatia para ver o número."
        actions={
          <span className="flex flex-wrap items-center gap-3">
            {sc.select && (
              <label className="inline-flex items-center gap-2 text-[13px] text-muted">
                Loja
                {sc.select}
              </label>
            )}
            <label className="inline-flex items-center gap-2 text-[13px] text-muted">
              Agrupar por
              <Select id="pie-group" aria-label="Agrupar colaboradores por" value={group} onChange={(v) => setGroup(v as "setor" | "funcao")} options={[{ value: "setor", label: "Setor" }, { value: "funcao", label: "Função" }]} />
            </label>
            {multi && (
              <label className="inline-flex items-center gap-2 text-[13px] text-muted">
                Lojas
                <Select id="pie-store" aria-label="Somar as lojas ou mostrar uma por uma" value={split} onChange={(v) => setSplit(v as "somadas" | "separadas")} options={[{ value: "somadas", label: "Somadas" }, { value: "separadas", label: "Uma por loja" }]} />
              </label>
            )}
          </span>
        }
      >
        Colaboradores por {group === "setor" ? "setor" : "função"}
      </CardTitle>
      <div className={groups.length > 1 ? "grid gap-8 xl:grid-cols-2" : "max-w-[760px]"}>
        {groups.map((g) => (
          <Pie key={g.id} title={g.title} slices={g.slices} empty="Nenhum colaborador cadastrado nesta loja." />
        ))}
      </div>
    </Card>
  );
}
