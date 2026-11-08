"use client";
import React, { useRef, useState } from "react";
import { useSim } from "../components/state";
import { Btn, ConfirmBtn, DurInput, Select, TextInput, TimeInput } from "../components/ui";
import { Card, CardTitle, PageHead, THEMES, type PageId } from "./SimpleApp";
import type { Sector, Store } from "../engine/types";
import { SECTOR_CATALOG, emptySector, simpleDemoStore, simpleEmptyStore } from "../engine/seed";
import { fmtDateBR, fmtDur, nextWeekStart, weekdayOf, weekStartOf } from "../engine/time";
import { saveFile } from "../storage/storage";
import { aplicarModelo12x36, demoStoreWithTeams, nomeDiaSemFolga, refazerSemanasDe, sairModelo12x36 } from "./logic";
import { RegraDomingoEditor } from "./RegraDomingo";
import { ModeloSetorEditor } from "./ModeloSetor";
import { JornadasEditor } from "./Jornadas";
import { AplicarHorarioSetores } from "./HorarioSetores";
import { exportExcel } from "../components/exporters";
import { clearUnlocked } from "../engine/solver";

import { CATEGORICAL } from "./Charts";
import { COLOR_KEYS, contrast, hexOf, inkFor, isHex } from "./colors";
import { ColorPicker } from "./ColorPicker";
import { DEFAULT_FONT, FONTS } from "./fonts";
const SWATCHES = CATEGORICAL;

/** Nomes curtos das cores da escala (o nome completo aparece na dica). */
const CURTO: Record<string, string> = { D: "Domingo/feriado", H: "Feriado fechado" };

export function PersonalizarPage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const { store } = sim;
  const cfg = store.config;
  const setCfg = (patch: Partial<typeof cfg>) => sim.updateStore((s) => ({ ...s, config: { ...s.config, ...patch } }));
  const setSec = (id: string, patch: Partial<Sector>) => sim.updateStore((s) => ({ ...s, sectors: s.sectors.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const [hol, setHol] = useState({ date: cfg.startDate, name: "" });
  const [dsf, setDsf] = useState({ date: cfg.startDate, todoAno: true });
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [modeloPend, setModeloPend] = useState<number | null>(null);
  const setores12 = store.sectors.filter((x) => !x.hidden && x.modeloEscala === "12x36");
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = async () => {
    const blob = new Blob([JSON.stringify({ app: "escala5x2", version: 1, stores: sim.stores }, null, 1)], { type: "application/json" });
    const r = await saveFile(`escala5x2-backup-${new Date().toISOString().slice(0, 10)}.json`, blob);
    sim.setToast(r === "saved" ? "Cópia de segurança gerada." : r === "declined" ? "Download cancelado." : "Não foi possível baixar aqui.");
  };
  const restore = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const list: Store[] = Array.isArray(j) ? j : j.stores ?? (j.sectors ? [j] : []);
      if (!list.length || !list.every((s) => s.id && Array.isArray(s.sectors) && Array.isArray(s.employees))) throw new Error("formato não reconhecido");
      sim.replaceStores(list);
      sim.setToast(`Dados restaurados: ${list.length} loja(s).`);
    } catch (e) {
      sim.setToast(`Não foi possível restaurar: ${(e as Error).message}.`);
    }
  };

  const visibleCount = store.sectors.filter((s) => !s.hidden).length;

  return (
    <>
      <PageHead title="Personalizar" sub="Deixe o sistema com a cara da sua loja: setores, horários de funcionamento, regras, cores e cópias de segurança." go={go} showSectors={false} />

      <Card>
        <CardTitle sub="Aparecem no menu, nos arquivos exportados e na escala impressa.">Empresa e loja</CardTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nome da empresa ou rede">
            <TextInput id="p-network" className="w-full" value={store.network} onChange={(v) => sim.updateStore((s) => ({ ...s, network: v }))} />
          </Field>
          <Field label="Nome desta loja">
            <TextInput id="p-store" className="w-full" value={store.name} onChange={(v) => sim.updateStore((s) => ({ ...s, name: v }))} />
          </Field>
          <Field label="Loja em uso">
            <Select id="p-store-pick" value={store.id} onChange={sim.setStoreId} options={sim.stores.map((s) => ({ value: s.id, label: s.name }))} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Btn id="p-stores" onClick={() => go("lojas")}>
            Cadastrar e organizar lojas
          </Btn>
          <span className="text-[13px] text-muted">
            {sim.stores.length} {sim.stores.length === 1 ? "loja cadastrada" : "lojas cadastradas"} · nova loja, várias de uma vez, duplicar e excluir ficam em Lojas.
          </span>
        </div>
      </Card>

      <Card id="setores">
        <CardTitle sub="Arraste para mudar a ordem, clique na bolinha para a cor e no nome para renomear. Setores que a loja não usa ficam escondidos, no fim.">Setores</CardTitle>
        <SetoresEditor />
      </Card>

      <Card>
        <CardTitle sub="Vale para todos os setores desta loja.">Funcionamento e jornada</CardTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Segunda a sábado abre">
            <TimeInput id="f-open" value={cfg.open} onChange={(v) => setCfg({ open: v })} />
          </Field>
          <Field label="Segunda a sábado fecha">
            <TimeInput id="f-close" value={cfg.close} onChange={(v) => setCfg({ close: v })} />
          </Field>
          <Field label="Domingo">
            <Select id="f-sun" value={cfg.sundayOpen ? 1 : 0} onChange={(v) => setCfg({ sundayOpen: v === 1 })} options={[{ value: 1, label: "Abre" }, { value: 0, label: "Fechado" }]} />
          </Field>
          {cfg.sundayOpen ? (
            <Field label="Domingo: das / até">
              <span className="flex items-center gap-2">
                <TimeInput id="f-sun-open" value={cfg.sundayStart} onChange={(v) => setCfg({ sundayStart: v })} />
                <TimeInput id="f-sun-close" value={cfg.sundayEnd} onChange={(v) => setCfg({ sundayEnd: v })} />
              </span>
            </Field>
          ) : (
            <div />
          )}
          <Field label="Modelo de escala">
            <Select
              id="f-model"
              value={modeloPend ?? (cfg.modeloEscala === "12x36" ? 12 : cfg.folgasPorSemana)}
              onChange={(v) => {
                const atual = cfg.modeloEscala === "12x36" ? 12 : cfg.folgasPorSemana;
                if (v === atual) return setModeloPend(null);
                // entrar ou sair do 12x36 muda todo mundo: pede confirmação
                if (v === 12 || cfg.modeloEscala === "12x36") return setModeloPend(v);
                setCfg({ folgasPorSemana: v });
              }}
              options={[
                { value: 2, label: "5x2 (2 folgas por semana)" },
                { value: 1, label: "6x1 (1 folga por semana)" },
                { value: 12, label: "12x36 (12h trabalho, 36h descanso)" },
              ]}
            />
          </Field>
          {modeloPend != null && (
            <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-navy-2 bg-surface-2 p-4 text-[13.5px]" role="region" aria-label="Mudar modelo de escala">
              {modeloPend === 12 ? (
                <>
                  <p className="font-bold">Passar todos os setores para 12x36?</p>
                  <p className="mt-1 text-muted">
                    Todas as {store.employees.length} pessoas passam a trabalhar dia sim, dia não (inclusive domingos e feriados), divididas em Plantão A e Plantão B em cada setor (metade de cada turno em cada plantão). Setores sem plantão ganham um plantão das 07h às 19h, que você ajusta em Horários (pode ser noturno). Para só alguns setores, use “Modelo por setor” logo abaixo. Quem tiver uma exceção pode voltar ao 5x2 na coluna “Regime” em Equipe. O que você fixou à mão na escala é mantido.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold">Sair do 12x36 e voltar para {modeloPend === 2 ? "5x2" : "6x1"}?</p>
                  <p className="mt-1 text-muted">Todos os setores e todas as pessoas em 12x36 voltam ao {modeloPend === 2 ? "5x2" : "6x1"}, com o turno normal do setor e o rodízio de domingos. A escala dessas pessoas é refeita. Para voltar só um setor, use “Modelo por setor” logo abaixo.</p>
                </>
              )}
              <div className="mt-3 flex flex-wrap gap-2.5">
                <Btn
                  kind="primary"
                  id="f-model-aplicar"
                  onClick={() => {
                    const v = modeloPend;
                    sim.updateStore((st) => (v === 12 ? aplicarModelo12x36(st) : sairModelo12x36(st, v)));
                    sim.setToast(v === 12 ? "Modelo 12x36 aplicado em todos os setores: cada um foi dividido em Plantão A e Plantão B, dia sim, dia não." : `Modelo ${v === 2 ? "5x2" : "6x1"} aplicado: quem estava em 12x36 voltou ao regime da loja.`);
                    setModeloPend(null);
                  }}
                >
                  {modeloPend === 12 ? "Aplicar 12x36 em todos os setores" : `Voltar para ${modeloPend === 2 ? "5x2" : "6x1"}`}
                </Btn>
                <Btn onClick={() => setModeloPend(null)}>Cancelar</Btn>
              </div>
            </div>
          )}
          <Field label="Jornada por dia">
            <DurInput id="f-daily" value={cfg.dailyMin} onChange={(v) => setCfg({ dailyMin: v })} />
          </Field>
          <Field label="Limite de horas por semana">
            <DurInput id="f-weekly" value={cfg.weeklyMaxMin} onChange={(v) => setCfg({ weeklyMaxMin: v })} />
          </Field>
          <div className="text-[12.5px] text-muted self-end pb-2">
            {cfg.modeloEscala === "12x36"
              ? "12x36 em todos os setores: cada pessoa trabalha dia sim, dia não (Plantão A e B). Os plantões ficam em Horários; exceções em 5x2 se escolhem por pessoa em Equipe → Regime."
              : `${fmtDur(cfg.dailyMin)} × ${7 - cfg.folgasPorSemana} dias = ${fmtDur(cfg.dailyMin * (7 - cfg.folgasPorSemana))} por semana.${setores12.length ? ` Em 12x36: ${setores12.map((x) => x.name).join(", ")}.` : ""} O 12x36 também pode ser escolhido por setor (abaixo) ou por pessoa (Equipe → Regime); os plantões ficam em Horários.`}
          </div>
          <Field label="Semana começa">
            <Select id="f-ws" value={cfg.weekStart ?? weekdayOf(cfg.startDate)} onChange={(v) => v !== (cfg.weekStart ?? weekdayOf(cfg.startDate)) && sim.updateStore((s) => clearUnlocked({ ...s, config: { ...s.config, weekStart: v, startDate: nextWeekStart(s.config.startDate, v) } }))} options={[{ value: 1, label: "Na segunda-feira" }, { value: 0, label: "No domingo" }]} />
          </Field>
          <Field label="Planejar a partir de">
            <input id="f-start" type="date" className="field" value={cfg.startDate} onChange={(e) => e.target.value && setCfg({ startDate: weekStartOf(e.target.value, cfg.weekStart ?? weekdayOf(cfg.startDate)) })} />
          </Field>
          <Field label="Quantas semanas">
            <Select id="f-weeks" value={cfg.weeks} onChange={(v) => setCfg({ weeks: v })} options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: `${n} semana${n > 1 ? "s" : ""}` }))} />
          </Field>
        </div>
        <div className="mt-5 border-t border-line pt-5" id="modelo-por-setor">
          <div className="text-[12px] font-bold uppercase tracking-wide text-muted">Modelo por setor</div>
          <p className="mb-3 mt-1 text-[13px] text-muted">Cada setor pode seguir o modelo da loja ({cfg.folgasPorSemana === 2 ? "5x2" : "6x1"}) ou ter o seu: 5x2, 6x1, uma jornada cadastrada (logo abaixo, em Jornadas) ou 12x36. Mudar o modelo da loja não muda os setores que têm modelo próprio. Dentro do setor, cada pessoa ainda pode ter outro regime em Equipe, coluna “Regime” (ex.: estagiários em 6x1 e CLT em 5x2).</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {store.sectors.filter((x) => !x.hidden).map((x) => (
              <ModeloSetorEditor key={x.id} st={store} sectorId={x.id} compacto />
            ))}
          </div>
        </div>
        {cfg.sundayOpen && (
          <div className="mt-5 max-w-[880px] border-t border-line pt-5">
            <RegraDomingoEditor st={store} sectorId={null} />
            <p className="mt-2 text-[12.5px] text-muted">Cada setor pode ter uma regra própria (em Equipe). Confira a regra na convenção coletiva e na legislação aplicável à categoria.</p>
          </div>
        )}
        <AplicarHorarioSetores />
      </Card>

      <Card id="jornadas">
        <CardTitle sub="Crie jornadas com o nome que quiser, os dias de trabalho por semana e as horas por dia (ex.: Meio período, 30 horas, 4 dias de 8h). Depois escolha quem segue cada uma em Equipe (coluna “Regime”) ou um setor inteiro em “Modelo por setor”.">Jornadas</CardTitle>
        <JornadasEditor />
      </Card>

      <Card>
        <CardTitle sub="Com a loja fechada, ninguém trabalha. Com a loja aberta, vale o horário e o turno de domingo. Mudar um feriado refaz a escala daquela semana (o que você fixou à mão fica).">Feriados e dias sem folga</CardTitle>
        <label className="mb-4 flex max-w-[760px] items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13.5px]">
          <input
            type="checkbox"
            id="hol-conta-folga"
            className="mt-1"
            checked={cfg.feriadoContaFolga !== false}
            onChange={(e) => {
              const v = e.target.checked;
              sim.updateStore((s) => refazerSemanasDe({ ...s, config: { ...s.config, feriadoContaFolga: v } }, s.config.holidays.filter((h) => !h.open).map((h) => h.date)));
              sim.setToast(v ? "Feriado com a loja fechada agora conta como uma das folgas da semana. As semanas com feriado foram refeitas." : "Feriado com a loja fechada não conta mais como folga. As semanas com feriado foram refeitas.");
            }}
          />
          <span>
            <b>Feriado com a loja fechada conta como uma das folgas da semana</b>
            <span className="block text-[12.5px] text-muted">Ex.: na semana do Natal (25/12 com a loja fechada), quem é 5x2 ganha só mais 1 folga, não 2. Confira na convenção coletiva.</span>
          </span>
        </label>
        <div className="flex flex-col gap-2.5 mb-4">
          {cfg.holidays.map((h, i) => (
            <div key={h.date + i} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3 text-[14px]">
              <strong className="tnum">{fmtDateBR(h.date)}</strong>
              <span>{h.name}</span>
              <label className="inline-flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={h.open} onChange={(e) => sim.updateStore((s) => refazerSemanasDe({ ...s, config: { ...s.config, holidays: s.config.holidays.map((x, j) => (j === i ? { ...x, open: e.target.checked } : x)) } }, [h.date]))} />
                Loja abre
              </label>
              <span className="ml-auto">
                <ConfirmBtn label="Remover" confirmLabel="Remover feriado" onConfirm={() => sim.updateStore((s) => refazerSemanasDe({ ...s, config: { ...s.config, holidays: s.config.holidays.filter((_, j) => j !== i) } }, [h.date]))} />
              </span>
            </div>
          ))}
          {!cfg.holidays.length && <p className="text-[13.5px] text-muted">Nenhum feriado no período.</p>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Data">
            <input id="hol-d" type="date" className="field" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
          </Field>
          <Field label="Nome">
            <input id="hol-n" className="field w-56" placeholder="Ex.: Finados" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
          </Field>
          <Btn
            kind="primary"
            onClick={() => {
              if (!hol.date || cfg.holidays.some((h) => h.date === hol.date)) return;
              sim.updateStore((s) => refazerSemanasDe({ ...s, config: { ...s.config, holidays: [...s.config.holidays, { date: hol.date, name: hol.name || "Feriado", open: false }].sort((a, b) => a.date.localeCompare(b.date)) } }, [hol.date]));
              sim.setToast(`Feriado ${fmtDateBR(hol.date)} adicionado com a loja fechada. A escala daquela semana foi refeita${cfg.feriadoContaFolga !== false ? " (o feriado conta como uma das folgas)" : ""}.`);
              setHol({ ...hol, name: "" });
            }}
          >
            Adicionar feriado
          </Btn>
        </div>

        <div className="mt-6 border-t border-line pt-5" id="dias-sem-folga">
          <div className="text-[15px] font-bold">Dias sem folga</div>
          <p className="mt-1 max-w-[100ch] text-[13px] text-muted">
            Nesses dias ninguém folga: todos trabalham (ex.: 24/12 e 31/12). Quem está de férias, falta ou atestado continua fora; quem não trabalha aos domingos continua de folga se o dia cair num domingo; o 12x36 segue o dia sim, dia não. As folgas da semana vão para os outros dias (nessa semana, o limite de pessoas de folga por dia sobe na mesma proporção para caber todo mundo).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(cfg.diasSemFolga ?? []).map((v) => (
              <span key={v} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px]" data-dia-sem-folga={v}>
                {nomeDiaSemFolga(v)}
                <button
                  type="button"
                  aria-label={`Remover ${nomeDiaSemFolga(v)}`}
                  className="text-muted hover:text-red"
                  onClick={() => sim.updateStore((s) => refazerSemanasDe({ ...s, config: { ...s.config, diasSemFolga: (s.config.diasSemFolga ?? []).filter((x) => x !== v) } }, [v]))}
                >
                  ×
                </button>
              </span>
            ))}
            {!(cfg.diasSemFolga ?? []).length && <span className="text-[13px] text-muted">Nenhum dia sem folga.</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Data">
              <input id="dsf-d" type="date" className="field" value={dsf.date} onChange={(e) => setDsf({ ...dsf, date: e.target.value })} />
            </Field>
            <label className="inline-flex items-center gap-2 pb-2 text-[13.5px]">
              <input type="checkbox" id="dsf-ano" checked={dsf.todoAno} onChange={(e) => setDsf({ ...dsf, todoAno: e.target.checked })} />
              Todo ano
            </label>
            <Btn
              kind="primary"
              id="dsf-add"
              onClick={() => {
                if (!dsf.date) return;
                const v = dsf.todoAno ? dsf.date.slice(5) : dsf.date;
                if ((cfg.diasSemFolga ?? []).includes(v)) return;
                sim.updateStore((s) => refazerSemanasDe({ ...s, config: { ...s.config, diasSemFolga: [...(s.config.diasSemFolga ?? []), v].sort() } }, [v]));
                sim.setToast(`${nomeDiaSemFolga(v)}: ninguém folga. A escala da semana foi refeita.`);
              }}
            >
              Adicionar dia sem folga
            </Btn>
            {!["12-24", "12-31"].every((d) => (cfg.diasSemFolga ?? []).includes(d)) && (
              <Btn
                id="dsf-natal"
                onClick={() => {
                  sim.updateStore((s) => refazerSemanasDe({ ...s, config: { ...s.config, diasSemFolga: Array.from(new Set([...(s.config.diasSemFolga ?? []), "12-24", "12-31"])).sort() } }, ["12-24", "12-31"]));
                  sim.setToast("24/12 e 31/12 (todo ano): ninguém folga. As semanas foram refeitas.");
                }}
              >
                + 24/12 e 31/12 (todo ano)
              </Btn>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle sub="Muda as cores do menu e dos botões e a fonte das letras.">Aparência</CardTitle>
        <div className="flex flex-wrap gap-3">
          {Object.entries(THEMES).map(([k, t]) => {
            const on = (cfg.theme ?? "roxo") === k;
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => setCfg({ theme: k })} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-[14px] font-semibold ${on ? "border-ink" : "border-line"}`}>
                <span className="flex overflow-hidden rounded-lg" aria-hidden>
                  <span className="h-8 w-6" style={{ background: t.vars["--navy"] }} />
                  <span className="h-8 w-6" style={{ background: t.vars["--yellow"] }} />
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="mt-6 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Fonte das letras</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" id="p-fonts" role="radiogroup" aria-label="Fonte das letras">
          {FONTS.map((f) => {
            const on = (cfg.font ?? DEFAULT_FONT) === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => sim.stores.forEach((st) => sim.updateStoreById(st.id, (x) => ({ ...x, config: { ...x.config, font: f.id } })))}
                className={`rounded-xl border px-4 py-3 text-left ${on ? "border-ink bg-surface-2" : "border-line hover:border-navy-2"}`}
                style={{ fontFamily: f.stack }}
              >
                <span className="block text-[16px] font-bold">{f.label}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{f.note}</span>
                <span className="mt-2 block text-[14px] tnum">Escala 08:15–18:39 · Folga · Sáb 31/10</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-muted">A fonte vale para todas as lojas e não muda os PDFs.</p>
      </Card>

      <Card id="cores">
        <CardTitle sub="Só muda a aparência: nenhuma escala, folga ou regra é alterada. Vale para a Semana, o Mês, Domingos, Almoço, o PDF e o Excel desta loja. A cor de cada turno fica em Horários.">Cores da escala</CardTitle>
        <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4" id="cores-escala">
          {COLOR_KEYS.map((k, idx) => {
            const cur = cfg.colors?.[k.key];
            const bg = hexOf(cfg, k.key);
            const ink = inkFor(bg);
            const ratio = contrast(bg, ink);
            const same = COLOR_KEYS.filter((o) => o.key !== k.key && hexOf(cfg, o.key).toLowerCase() === bg.toLowerCase()).map((o) => o.label.toLowerCase());
            const aviso = isHex(cur) && ratio < 4.5 ? `Texto difícil de ler (${ratio.toFixed(1)}:1)` : same.length ? `Igual a ${same.join(", ")}` : "";
            return (
              <div key={k.key} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-line px-2.5 py-1.5" title={aviso || undefined}>
                <ColorPicker
                  id={`cor-${k.key}`}
                  align={idx % 4 === 3 ? "right" : "left"}
                  label={`Cor de ${k.label}`}
                  value={cur ?? bg}
                  allowNone
                  compact
                  onChange={(c) => {
                    const next = { ...(cfg.colors ?? {}) };
                    if (c) next[k.key] = c;
                    else delete next[k.key];
                    setCfg({ colors: Object.keys(next).length ? next : undefined });
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold" title={k.label}>{CURTO[k.key] ?? k.label}</span>
                  {aviso && <span className="block truncate text-[11.5px] font-bold text-red">{aviso}</span>}
                </span>
              </div>
            );
          })}
        </div>
        {cfg.colors && Object.keys(cfg.colors).length > 0 && (
          <div className="mt-3">
            <ConfirmBtn label="Restaurar cores originais" confirmLabel="Confirmar: voltar às cores originais" onConfirm={() => setCfg({ colors: undefined })} />
          </div>
        )}
      </Card>

      <Card>
        <CardTitle sub="Guarde uma cópia de tudo (todas as lojas) e restaure quando precisar, inclusive em outro computador.">Dados</CardTitle>
        <div className="flex flex-wrap gap-3">
          <Btn kind="primary" onClick={backup}>
            Baixar cópia de segurança
          </Btn>
          <Btn onClick={() => fileRef.current?.click()}>Restaurar uma cópia…</Btn>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          <Btn
            onClick={async () => {
              const blob = await exportExcel(store, null);
              const r = await saveFile(`escala-${store.name}.xlsx`.toLowerCase().replace(/[^a-z0-9à-ú.-]+/gi, "-"), blob);
              sim.setToast(r === "saved" ? "Planilha gerada." : "Download cancelado.");
            }}
          >
            Excel da loja inteira
          </Btn>
          <Btn onClick={() => setFresh(fresh ? null : SECTOR_CATALOG.slice(0, 1).map((c) => c.name))}>Começar do zero…</Btn>
          <ConfirmBtn kind="ghost" label="Restaurar exemplo de demonstração" confirmLabel="Substituir esta loja pelo exemplo" onConfirm={() => sim.updateStore((s) => ({ ...demoStoreWithTeams(s.config.startDate), id: s.id }))} />
        </div>
        {fresh && (
          <div className="mt-5 rounded-xl border border-navy-2 p-5">
            <div className="mb-3 text-[15px] font-bold">Quais setores sua loja tem?</div>
            <div className="flex flex-wrap gap-2">
              {SECTOR_CATALOG.map((c) => {
                const on = fresh.includes(c.name);
                return (
                  <button key={c.key} type="button" aria-pressed={on} onClick={() => setFresh(on ? fresh.filter((x) => x !== c.name) : [...fresh, c.name])} className={`rounded-full border px-4 py-2 text-[13.5px] ${on ? "bg-navy text-navy-ink border-navy" : "border-line bg-surface"}`}>
                    {c.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[12.5px] text-muted">Os outros ficam escondidos e podem ser mostrados depois. Setores próprios você cria em Setores.</p>
            <div className="mt-4 flex gap-2.5">
              <ConfirmBtn
                kind="primary"
                label={`Criar loja vazia com ${fresh.length} setor(es)`}
                confirmLabel="Apagar os dados desta loja e começar"
                onConfirm={() => {
                  const st = simpleEmptyStore(store.name, store.network, fresh);
                  sim.updateStore(() => ({ ...st, id: store.id }));
                  setFresh(null);
                  go("equipe");
                }}
              />
              <Btn onClick={() => setFresh(null)}>Cancelar</Btn>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[12px] font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
/** Setores: lista compacta (arrastar para ordenar, cor, nome, pessoas) e os escondidos numa linha só. */
function SetoresEditor() {
  const sim = useSim();
  const { store } = sim;
  const [nome, setNome] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [corAberta, setCorAberta] = useState<string | null>(null);
  const setSec = (id: string, patch: Partial<Sector>) => sim.updateStore((s) => ({ ...s, sectors: s.sectors.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const visiveis = store.sectors.filter((s) => !s.hidden);
  const escondidos = store.sectors.filter((s) => s.hidden);
  const pessoas = (id: string) => store.employees.filter((e) => e.sectorId === id).length;
  /** põe o setor arrastado no lugar do alvo */
  const reordenar = (id: string, para: string) => {
    if (id === para) return;
    sim.updateStore((s) => {
      const list = s.sectors.slice();
      const de = list.findIndex((x) => x.id === id);
      const ate = list.findIndex((x) => x.id === para);
      if (de < 0 || ate < 0) return s;
      const [m] = list.splice(de, 1);
      list.splice(ate, 0, m);
      return { ...s, sectors: list };
    });
  };
  const mover = (id: string, dir: -1 | 1) => {
    const i = visiveis.findIndex((x) => x.id === id);
    const outro = visiveis[i + dir];
    if (outro) reordenar(id, outro.id);
  };
  const excluir = (id: string) =>
    sim.updateStore((s) => {
      const gone = new Set(s.employees.filter((e) => e.sectorId === id).map((e) => e.id));
      return {
        ...s,
        sectors: s.sectors.filter((x) => x.id !== id),
        employees: s.employees.filter((e) => !gone.has(e.id)).map((e) => ({ ...e, quals: e.quals.filter((q) => q !== id) })),
        reassignments: s.reassignments.filter((r) => r.toSectorId !== id && !gone.has(r.employeeId)),
        assignments: s.assignments.filter((a) => !gone.has(a.employeeId)),
      };
    });
  const criar = () => {
    const name = nome.trim();
    if (!name) return;
    // setor escondido com o mesmo nome: só volta a aparecer
    const igual = escondidos.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (igual) {
      setSec(igual.id, { hidden: false });
      setNome("");
      sim.setToast(`O setor ${igual.name} já existia e voltou a aparecer.`);
      return;
    }
    const sec: Sector = { ...emptySector({ key: "custom", name, sing: "colaborador", plur: "colaboradores", func: "Colaborador", post: name }), color: SWATCHES.find((c) => !store.sectors.some((x) => !x.hidden && x.color === c)) ?? SWATCHES[0], hidden: false };
    sim.updateStore((s) => ({ ...s, sectors: [...s.sectors, sec] }));
    setNome("");
    sim.setSectorId(sec.id);
    sim.setToast(`Setor ${name} criado, com dois turnos e um turno de domingo (ajuste em Horários). Cadastre a equipe em Equipe.`);
  };
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-2 md:grid-cols-2" id="sec-lista" aria-label="Setores mostrados">
        {visiveis.map((s, i) => {
          const n = pessoas(s.id);
          return (
            <li
              key={s.id}
              id={`sec-item-${s.id}`}
              data-setor={s.id}
              className={`flex min-w-0 items-center gap-2 rounded-xl border bg-surface px-2.5 py-1.5 ${alvo === s.id && arrastando && arrastando !== s.id ? "border-navy-2 ring-2 ring-focus/40" : "border-line"} ${arrastando === s.id ? "opacity-50" : ""}`}
              onDragOver={(e) => {
                if (!arrastando) return;
                e.preventDefault();
                setAlvo(s.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/setor") || arrastando;
                if (id) reordenar(id, s.id);
                setArrastando(null);
                setAlvo(null);
              }}
            >
              <span
                draggable
                role="button"
                tabIndex={0}
                id={`sec-drag-${s.id}`}
                title="Arraste para mudar a ordem (ou use as setas do teclado)"
                aria-label={`Arrastar ${s.name} para mudar a ordem`}
                className="cursor-grab select-none rounded-md px-1 text-[18px] leading-none text-muted hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/setor", s.id);
                  e.dataTransfer.effectAllowed = "move";
                  const el = document.getElementById(`sec-item-${s.id}`);
                  if (el) e.dataTransfer.setDragImage(el, 20, 20);
                  setArrastando(s.id);
                }}
                onDragEnd={() => {
                  setArrastando(null);
                  setAlvo(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowLeft") (e.preventDefault(), mover(s.id, -1));
                  if (e.key === "ArrowDown" || e.key === "ArrowRight") (e.preventDefault(), mover(s.id, 1));
                }}
              >
                ⠿
              </span>
              <span className="hidden w-5 text-right text-[11.5px] font-semibold text-muted tnum sm:inline">{i + 1}</span>
              <span className="relative">
                <button type="button" id={`sec-cor-${s.id}`} aria-label={`Cor de ${s.name}`} aria-expanded={corAberta === s.id} onClick={() => setCorAberta(corAberta === s.id ? null : s.id)} className="block h-6 w-6 rounded-full border-2 border-surface shadow" style={{ background: s.color ?? "var(--yellow)" }} />
                {corAberta === s.id && (
                  <span className="absolute left-0 top-8 z-30 grid w-44 grid-cols-4 gap-2 rounded-xl border border-line bg-surface p-3 shadow-lg">
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Cor ${c}`}
                        onClick={() => {
                          setSec(s.id, { color: c });
                          setCorAberta(null);
                        }}
                        className="h-7 w-7 rounded-full"
                        style={{ background: c, outline: s.color === c ? "2px solid var(--ink)" : undefined, outlineOffset: 2 }}
                      />
                    ))}
                  </span>
                )}
              </span>
              <TextInput id={`sec-name-${s.id}`} aria-label="Nome do setor" className="w-0 min-w-0 flex-1 !border-transparent !bg-transparent !px-1.5 font-bold hover:!border-line focus:!border-line" value={s.name} onChange={(v) => v.trim() && setSec(s.id, { name: v.trim() })} />
              <span className="whitespace-nowrap text-[12.5px] text-muted tnum" title={`${n} ${n === 1 ? "pessoa" : "pessoas"}`}>
                {n}
                <span className="hidden sm:inline"> {n === 1 ? "pessoa" : "pessoas"}</span>
              </span>
              <button
                type="button"
                id={`sec-esconder-${s.id}`}
                disabled={visiveis.length <= 1}
                title={n ? `Esconder (as ${n} pessoas continuam cadastradas)` : "Esconder: a loja não usa este setor"}
                aria-label={`Esconder ${s.name}`}
                onClick={() => setSec(s.id, { hidden: true })}
                className="rounded-md px-1.5 py-1 text-[12px] font-semibold text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline sm:hidden">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3.2 4.2M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
                </svg>
                <span className="hidden sm:inline">Esconder</span>
              </button>
              <ConfirmBtn label="×" title={`Excluir ${s.name}`} className="!min-h-0 !px-2 !py-0.5 !text-[15px]" confirmLabel={n ? `Excluir com ${n} pessoa${n === 1 ? "" : "s"}` : "Excluir"} onConfirm={() => excluir(s.id)} />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <input
          id="ns-name"
          className="field w-64"
          placeholder="Novo setor (ex.: Peixaria)"
          aria-label="Nome do novo setor"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && criar()}
        />
        <Btn kind="primary" id="ns-criar" onClick={criar} disabled={!nome.trim()}>
          + Criar setor
        </Btn>
      </div>

      {escondidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3" id="sec-escondidos">
          <span className="mr-1 text-[12.5px] font-semibold text-muted">Escondidos ({escondidos.length}) · clique para mostrar:</span>
          {escondidos.map((s) => (
            <span key={s.id} className="inline-flex items-center rounded-full border border-dashed border-line bg-surface-2 text-[12.5px]">
              <button type="button" data-mostrar={s.id} title={`Mostrar ${s.name}`} onClick={() => setSec(s.id, { hidden: false })} className="rounded-l-full px-2.5 py-1 hover:text-ink">
                + {s.name}
              </button>
              <ConfirmBtn label="×" title={`Excluir ${s.name}`} className="!min-h-0 !rounded-l-none !rounded-r-full !border-0 !bg-transparent !px-2 !py-0.5 !text-[14px]" confirmLabel={pessoas(s.id) ? `Excluir com ${pessoas(s.id)} pessoa(s)` : "Excluir"} onConfirm={() => excluir(s.id)} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
