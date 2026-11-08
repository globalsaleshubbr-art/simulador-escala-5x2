"use client";
// Tela de importação de colaboradores: baixar modelo, escolher a planilha, conferir a prévia e confirmar.
import React, { useRef, useState } from "react";
import { useSim } from "../components/state";
import { Btn } from "../components/ui";
import { Card, CardTitle } from "./SimpleApp";
import { saveFile } from "../storage/storage";
import { conferir, importar, lerCSV, lerXLSX, linhasParaRegistros, modeloXLSX, type LinhaPrevia } from "./importPeople";

const ROTULO: Record<LinhaPrevia["status"], { t: string; c: string }> = {
  novo: { t: "Novo", c: "bg-green-light text-green-light-ink" },
  atualiza: { t: "Atualiza", c: "bg-yellow text-yellow-ink" },
  ignorado: { t: "Já existe", c: "bg-surface-2 text-muted" },
  erro: { t: "Erro", c: "bg-red text-red-ink" },
};

export function ImportarPlanilha({ onClose }: { onClose: () => void }) {
  const sim = useSim();
  const { store, sector } = sim;
  const ref = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [registros, setRegistros] = useState<Parameters<typeof conferir>[1] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizar, setAtualizar] = useState(true);
  const [lendo, setLendo] = useState(false);
  const previa = registros ? conferir(store, registros, { setorPadrao: sector, atualizar }) : null;
  const n = (s: LinhaPrevia["status"]) => previa?.filter((l) => l.status === s).length ?? 0;
  const validos = n("novo") + n("atualiza");

  async function ler(f: File) {
    setErro(null);
    setRegistros(null);
    setArquivo(f.name);
    setLendo(true);
    try {
      const rows = /\.xlsx$/i.test(f.name) ? await lerXLSX(await f.arrayBuffer()) : /\.(csv|txt)$/i.test(f.name) ? lerCSV(await f.text()) : null;
      if (!rows) throw new Error("Use um arquivo .xlsx (Excel) ou .csv. Arquivos .xls antigos: abra no Excel e salve como .xlsx.");
      const r = linhasParaRegistros(rows);
      if (r.erro) throw new Error(r.erro);
      if (!r.registros.length) throw new Error("A planilha não tem nenhuma pessoa abaixo do cabeçalho.");
      setRegistros(r.registros);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  }

  return (
    <Card>
      <CardTitle sub={`As pessoas entram em ${store.name}. Linha sem setor vai para ${sector.name}. Nada muda até você confirmar.`}>Importar colaboradores por planilha</CardTitle>
      <div className="flex flex-wrap items-center gap-3">
        <Btn
          onClick={async () => {
            try {
              const r = await saveFile("modelo-importacao-colaboradores.xlsx", await modeloXLSX(store));
              sim.setToast(r === "saved" ? "Modelo baixado. Preencha a aba Colaboradores e importe aqui." : r === "declined" ? "Download cancelado." : "Não foi possível baixar o arquivo aqui.");
            } catch (e) {
              sim.setToast(`Falha ao gerar o modelo: ${(e as Error).message}`);
            }
          }}
        >
          Baixar modelo (Excel)
        </Btn>
        <input
          ref={ref}
          id="imp-file"
          type="file"
          accept=".xlsx,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) ler(f);
          }}
        />
        <Btn kind="primary" onClick={() => ref.current?.click()} disabled={lendo}>
          {lendo ? "Lendo…" : arquivo ? "Escolher outra planilha" : "Escolher planilha (.xlsx ou .csv)"}
        </Btn>
        {arquivo && <span className="text-[13px] text-muted">{arquivo}</span>}
        <label className="ml-auto inline-flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" id="imp-atualizar" checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} />
          Atualizar quem já existe (mesma matrícula ou, sem matrícula, mesmo nome)
        </label>
      </div>
      {erro && (
        <p className="mt-4 rounded-xl border border-pink-line bg-pink px-4 py-3 text-[13.5px]" role="alert">
          {erro}
        </p>
      )}
      {previa && (
        <div className="mt-5" role="region" aria-label="Prévia da importação">
          <p className="mb-3 text-[14px]">
            <b>{previa.length}</b> linhas · <b className="text-green">{n("novo")}</b> novas · <b>{n("atualiza")}</b> para atualizar · <b>{n("ignorado")}</b> já existentes · <b className={n("erro") ? "text-red" : ""}>{n("erro")}</b> com erro
          </p>
          <div className="scroll-x max-h-[420px] overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-2">
                <tr>
                  <th className="th text-left">Linha</th>
                  <th className="th text-left">Situação</th>
                  <th className="th text-left">Nome</th>
                  <th className="th text-left">Setor</th>
                  <th className="th text-left">Observação</th>
                </tr>
              </thead>
              <tbody>
                {previa.map((l) => (
                  <tr key={l.linha} className="border-t border-line">
                    <td className="td tnum">{l.linha}</td>
                    <td className="td">
                      <span className={`rounded px-2 py-0.5 text-[11.5px] font-bold uppercase ${ROTULO[l.status].c}`}>{ROTULO[l.status].t}</span>
                    </td>
                    <td className="td font-semibold">{l.nome}</td>
                    <td className="td">{l.setor}</td>
                    <td className={`td ${l.status === "erro" ? "text-red" : "text-muted"}`}>{l.msgs.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Btn
              kind="primary"
              id="imp-confirmar"
              disabled={!validos}
              onClick={() => {
                const res = importar(store, conferir(store, registros!, { setorPadrao: sector, atualizar }));
                sim.updateStore(() => res.store);
                sim.setToast(`Importação concluída: ${res.criados} ${res.criados === 1 ? "pessoa cadastrada" : "pessoas cadastradas"} e ${res.atualizados} ${res.atualizados === 1 ? "atualizada" : "atualizadas"}.${n("erro") ? ` ${n("erro")} ${n("erro") === 1 ? "linha com erro ficou" : "linhas com erro ficaram"} de fora.` : ""} A escala de quem entrou foi completada automaticamente.`);
                onClose();
              }}
            >
              Importar {validos} {validos === 1 ? "pessoa" : "pessoas"}
            </Btn>
            <Btn onClick={onClose}>Cancelar</Btn>
            {n("erro") > 0 && <span className="text-[13px] text-muted">Linhas com erro não entram. Corrija na planilha e escolha o arquivo de novo.</span>}
          </div>
        </div>
      )}
      {!previa && !erro && (
        <p className="mt-4 text-[13px] text-muted">
          Colunas: Nome (obrigatório), Matrícula, Função, Setor, Regime (5x2 ou 12x36), Turno, Domingos, Folga fixa, Sexo, Admissão, Horas por semana, Contratação (CLT, Estagiário ou Jovem aprendiz) e Horas por dia. O modelo traz as listas de opções e as instruções.
        </p>
      )}
      {!previa && (
        <div className="mt-3">
          <Btn onClick={onClose}>Fechar</Btn>
        </div>
      )}
    </Card>
  );
}
