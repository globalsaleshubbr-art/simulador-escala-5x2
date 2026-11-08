// Exportação real em Excel (.xlsx) e PDF.
import type { Store } from "../engine/types";
import { analyzeSector } from "../engine/analysis";
import { cellCode, folgasDe, nomeFolgas, shiftEnd, shiftWorkMin } from "../engine/model";
import { fmtDateBR, fmtDur, fmtTime, WEEKDAY_SHORT, WEEK_ORDER_MON } from "../engine/time";
import { daysLabel } from "./ui";

const FILL: Record<string, string> = {
  T: "FFFFFFFF",
  D: "FFFFF1CC",
  F: "FFE3E8F0",
  A: "FFF9D3D9",
  M: "FFFFE2C6",
  V: "FFD9E6FF",
  H: "FFE3E8F0",
  red: "FFC62A43",
  yellow: "FFF3D36B",
  light: "FFC4EAD3",
  green: "FF1E8F4E",
  none: "FFF6F8FB",
};

export async function exportExcel(store: Store, sectorId: string | null): Promise<Blob> {
  const names = sectorId ? [store.sectors.find((s) => s.id === sectorId)?.name ?? ""] : null;
  return exportExcelStores([store], names);
}

/** Excel de uma ou várias lojas: setores pelo nome (ou todos com pessoas). Com várias lojas, as abas levam o número da loja. */
export async function exportExcelStores(stores: Store[], sectorNames: string[] | null): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Escala 5x2 — Simulador";
  wb.created = new Date();
  const multi = stores.length > 1;
  const resumo = wb.addWorksheet("Resumo");
  const used = new Set<string>(["Resumo"]);
  const sheetName = (base: string) => {
    let n = base.slice(0, 31);
    let k = 2;
    while (used.has(n)) n = `${base.slice(0, 28)} ${k++}`;
    used.add(n);
    return n;
  };
  stores.forEach((store, si) => {
  const tag = multi ? `L${si + 1} ` : "";
  const cfgColors = store.config.colors ?? {};
  const fillOf = (code: string) => {
    const c = (cfgColors as Record<string, string | undefined>)[code];
    return c && /^#[0-9a-fA-F]{6}$/.test(c) ? `FF${c.slice(1).toUpperCase()}` : FILL[code] ?? FILL.T;
  };
  const sectors = store.sectors.filter((s) => (sectorNames ? sectorNames.includes(s.name) && !s.hidden : store.employees.some((e) => e.sectorId === s.id)));
  resumo.addRow([`${multi ? `L${si + 1} · ` : ""}${store.network} — ${store.name}`]).font = { bold: true, size: 14 };
  resumo.addRow([`Período: ${fmtDateBR(store.config.startDate)} · ${store.config.weeks} semana(s) · folgas/semana: ${store.config.folgasPorSemana} · jornada ${fmtDur(store.config.dailyMin)}/dia · limite ${fmtDur(store.config.weeklyMaxMin)}`]);
  resumo.addRow([]);
  const hdr = resumo.addRow(["Setor", "Pessoas", "Cobertura dos mínimos", "Déficit (h/semana)", "Problemas", "Horas médias/pessoa"]);
  hdr.font = { bold: true };

  for (const sec of sectors) {
    const a = analyzeSector(store, sec.id);
    resumo.addRow([sec.name, a.employees.length, Number((a.totals.pct / 100).toFixed(4)), Number(a.totals.deficitHoursPerWeek.toFixed(2)), a.alerts.filter((x) => x.severity === "problema").length, fmtDur(a.indicators.avgWeeklyHours * 60)]);
    resumo.getCell(`C${resumo.rowCount}`).numFmt = "0.0%";

    // --- escala
    const ws = wb.addWorksheet(sheetName(`${tag}Escala ${sec.name}`));
    const days = a.days;
    ws.addRow(["Nome", "Função", ...days.map((d) => `${WEEKDAY_SHORT[d.weekday]} ${fmtDateBR(d.date, false)}`), ...Array.from({ length: store.config.weeks }, (_, w) => `Sem ${w + 1}`)]).font = { bold: true };
    for (const e of a.employees) {
      const row = ws.addRow([e.name || e.func, e.func, ...days.map((d) => cellCode(sec, e.id, d)), ...(a.weekly[e.id] ?? []).map((m) => fmtDur(m))]);
      days.forEach((d, i) => {
        const c = row.getCell(3 + i);
        const code = String(c.value);
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillOf(code) } };
        c.alignment = { horizontal: "center" };
        if (sec.schedule[e.id]?.[d.date]?.lock) c.note = "Bloqueada";
      });
    }
    ws.addRow(["Trabalhando", "", ...days.map((d) => a.employees.filter((e) => ["T", "D"].includes(cellCode(sec, e.id, d))).length)]).font = { bold: true };
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 20;
    for (let i = 3; i < 3 + days.length; i++) ws.getColumn(i).width = 9;
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];

    // --- cobertura
    const wc = wb.addWorksheet(sheetName(`${tag}Cobertura ${sec.name}`));
    wc.addRow(["Dia", ...a.axis.map((t) => fmtTime(t))]).font = { bold: true };
    for (const c of a.coverage) {
      if (c.day.closed) continue;
      const r = wc.addRow([`${WEEKDAY_SHORT[c.day.weekday]} ${fmtDateBR(c.day.date, false)}`, ...c.counts]);
      c.status.forEach((st, i) => {
        if (st === "closed") return;
        const cell = r.getCell(2 + i);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL[st] ?? FILL.none } };
        if (c.req[i]) cell.note = `Mínimo ${c.req[i]}${c.ideal[i] > c.req[i] ? ` · ideal ${c.ideal[i]}` : ""}`;
        cell.alignment = { horizontal: "center" };
        if (st === "red" || st === "green") cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      });
    }
    wc.getColumn(1).width = 12;
    wc.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

    // --- pessoas / turnos / mínimos / alertas
    const wp = wb.addWorksheet(sheetName(`${tag}Pessoas ${sec.name}`));
    wp.addRow(["Função", "Nome", "Matrícula", "Sexo", "Regime", "Turno", "Domingo", "Folga fixa", "Jornada contratual", "Contratação", "Horas por dia", "Coringa"]).font = { bold: true };
    for (const e of a.employees) {
      wp.addRow([
        e.func,
        e.name,
        e.matricula,
        e.sex,
        e.regime === "12x36" ? `12x36 Plantão ${e.plantaoFase === 1 ? "B" : "A"}` : e.jornadaId && store.config.jornadas?.some((j) => j.id === e.jornadaId) ? store.config.jornadas!.find((j) => j.id === e.jornadaId)!.nome : nomeFolgas(folgasDe(store, e)),
        sec.shifts.find((s) => s.id === e.shiftId)?.name ?? "",
        e.regime === "12x36" ? "Dia sim, dia não" : e.sundayCycle === 0 ? "Não trabalha" : e.sundayCycle === 2 && (e.sundayOffset === 1 || e.sundayOffset === 2) ? `Time ${e.sundayOffset === 2 ? "A" : "B"} (domingo sim, domingo não)` : `Folga 1 a cada ${e.sundayCycle}`,
        [e.fixedOff, e.fixedOff2].filter((x): x is number => x != null).map((x) => WEEKDAY_SHORT[x]).join(" e "),
        fmtDur(e.contractMin),
        e.contratacao === "estagio" ? "Estagiário" : e.contratacao === "aprendiz" ? "Jovem aprendiz" : "CLT",
        e.contratacao === "estagio" || e.contratacao === "aprendiz" ? fmtDur(e.horasDia ?? 360) : "",
        e.joker ? "Sim" : "",
      ]);
    }
    wp.addRow([]);
    wp.addRow(["Turno", "Entrada", "Intervalo", "Duração", "Jornada efetiva", "Saída", "Domingo/feriado", "12x36"]).font = { bold: true };
    for (const s of sec.shifts) wp.addRow([s.name, s.start, s.breakStart ?? "—", s.breakStart ? fmtDur(s.breakMin) : "—", fmtDur(shiftWorkMin(store.config, s)), fmtTime(shiftEnd(store.config, s)) + (shiftEnd(store.config, s) > 1440 ? " (dia seguinte)" : ""), s.special ? "Sim" : "", s.plantao ? "Sim" : ""]);
    wp.addRow([]);
    wp.addRow(["Dias", "De", "Até", "Mínimo", "Ideal", "Observação"]).font = { bold: true };
    for (const r of sec.minRules) wp.addRow([r.date ? fmtDateBR(r.date) : daysLabel(r.days), r.start, r.end, r.min, r.ideal ?? "", r.label ?? ""]);
    wp.addRow([]);
    wp.addRow(["Alertas"]).font = { bold: true };
    for (const al of a.alerts) wp.addRow([al.title, `${al.text}${al.ranges ? " — " + al.ranges.map((r) => `${r.label} (${r.weeks} sem.)`).join("; ") : ""}`]);
    wp.columns.forEach((c) => (c.width = 18));
  }
  resumo.addRow([]);
  });
  resumo.getColumn(1).width = 24;
  resumo.getColumn(3).width = 22;
  resumo.getColumn(4).width = 18;
  resumo.getColumn(6).width = 20;
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function exportPDF(store: Store, sectorId: string | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const sectors = store.sectors.filter((s) => (sectorId ? s.id === sectorId : store.employees.some((e) => e.sectorId === s.id)));
  const navy: [number, number, number] = [15, 31, 61];
  sectors.forEach((sec, si) => {
    if (si > 0) doc.addPage();
    const a = analyzeSector(store, sec.id);
    doc.setFillColor(...navy);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 58, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(`Escala 5x2 · ${store.name} · ${sec.name}`, 28, 28);
    doc.setFontSize(9);
    doc.text(
      `${store.network} · início ${fmtDateBR(store.config.startDate)} · ${store.config.weeks} semana(s) · cobertura ${a.totals.pct.toFixed(1)}% · déficit ${fmtDur(a.totals.deficitHoursPerWeek * 60)}/semana · ${a.employees.length} pessoas`,
      28,
      45,
    );
    doc.setTextColor(20, 30, 50);
    const days = a.days.slice(0, 28);
    autoTable(doc, {
      startY: 70,
      head: [["Nome", ...days.map((d) => `${String(d.date.slice(8))}\n${WEEKDAY_SHORT[d.weekday].slice(0, 1)}`), ...Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => `S${w + 1}`)]],
      body: a.employees.map((e) => [e.name || e.func, ...days.map((d) => cellCode(sec, e.id, d)), ...(a.weekly[e.id] ?? []).slice(0, Math.ceil(days.length / 7)).map((m) => fmtDur(m))]),
      styles: { fontSize: 6.5, cellPadding: 1.5, halign: "center" },
      headStyles: { fillColor: navy, fontSize: 6.5 },
      columnStyles: { 0: { halign: "left", cellWidth: 90 } },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index === 0 || data.column.index > days.length) return;
        const v = String(data.cell.raw);
        const map: Record<string, [number, number, number]> = { F: [227, 232, 240], D: [255, 241, 204], A: [249, 211, 217], V: [217, 230, 255], H: [227, 232, 240] };
        if (map[v]) data.cell.styles.fillColor = map[v];
      },
    });
    // mapa de cobertura da 1ª semana (por hora cheia para caber na página)
    doc.addPage();
    doc.setFontSize(12);
    doc.text(`Mapa de cobertura · ${sec.name} · semana de ${fmtDateBR(a.days[0].date)}`, 28, 32);
    const step = Math.max(1, Math.round(30 / store.config.slot));
    const cols = a.axis.map((t, i) => ({ t, i })).filter((x) => x.i % step === 0);
    const week = a.coverage.filter((c) => c.day.week === 0);
    autoTable(doc, {
      startY: 44,
      head: [["Dia", ...cols.map((c) => fmtTime(c.t))]],
      body: WEEK_ORDER_MON.map((wd) => week.find((c) => c.day.weekday === wd))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => [`${WEEKDAY_SHORT[c.day.weekday]} ${fmtDateBR(c.day.date, false)}`, ...cols.map((x) => (c.day.closed ? "" : `${c.counts[x.i]}${c.req[x.i] ? "/" + c.req[x.i] : ""}`))]),
      styles: { fontSize: 6.5, cellPadding: 1.5, halign: "center" },
      headStyles: { fillColor: navy, fontSize: 6.5 },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index === 0) return;
        const raw = String(data.cell.raw);
        const [n, r] = raw.split("/").map(Number);
        if (!raw || !r) return;
        if (n < r) {
          data.cell.styles.fillColor = [198, 42, 67];
          data.cell.styles.textColor = [255, 255, 255];
        } else if (n === r) data.cell.styles.fillColor = [196, 234, 211];
        else {
          data.cell.styles.fillColor = [30, 143, 78];
          data.cell.styles.textColor = [255, 255, 255];
        }
      },
    });
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
    doc.setFontSize(10);
    doc.text("O que precisa de atenção", 28, y);
    autoTable(doc, {
      startY: y + 6,
      body: a.alerts.slice(0, 25).map((al) => [al.title, `${al.text}${al.ranges ? " — " + al.ranges.slice(0, 4).map((r) => `${r.label} (${r.weeks} sem.)`).join("; ") : ""}`]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" } },
    });
  });
  return doc.output("blob");
}
