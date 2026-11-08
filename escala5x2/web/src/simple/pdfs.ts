// Escala individual: uma página (ou mais, se o período for longo) por colaborador, para imprimir ou mandar no WhatsApp.
import type { Employee, Store } from "../engine/types";
import { buildDays, cellCode, dayShift, employeeShift, isWorking } from "../engine/model";
import { fmtDateBR, fmtDur, fmtTime, WEEKDAY_LONG } from "../engine/time";
import { inkRgb, rgbOf } from "./colors";

export async function personalPDF(items: { store: Store; emp: Employee }[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const PURPLE: [number, number, number] = [61, 26, 110];

  items.forEach(({ store, emp: e }, i) => {
    if (i > 0) doc.addPage();
    const days = buildDays(store.config);
    const cfg = store.config;
    const sector = store.sectors.find((s) => s.id === e.sectorId)!;
    const sh = employeeShift(store, sector, e, false);
    // faixa de título
    doc.setFillColor(...PURPLE);
    doc.rect(0, 0, W, 78, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text(`SIMULADOR ESCALA 5X2 · ${store.name}`, 36, 26);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(e.name || e.func, 36, 52);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const turno = sh.shift ? `${sh.shift.name} · ${fmtTime(sh.start)}–${fmtTime(sh.end)}${sh.breakEnd > sh.breakStart ? ` · intervalo ${fmtTime(sh.breakStart)}–${fmtTime(sh.breakEnd)}` : ""}` : "sem turno";
    doc.text(`${sector.name} · ${turno}`, 36, 68);
    doc.setTextColor(30, 30, 40);
    doc.setFontSize(10.5);
    doc.text(`Sua escala de ${fmtDateBR(days[0].date)} a ${fmtDateBR(days[days.length - 1].date)}`, 36, 102);

    const body: (string | { content: string; colSpan: number; styles: object })[][] = [];
    let weekMin = 0;
    let folgas = 0;
    let domFolga = 0;
    days.forEach((d, k) => {
      const c = cellCode(sector, e.id, d);
      const date = `${String(d.date.slice(8, 10))}/${d.date.slice(5, 7)}`;
      const dia = WEEKDAY_LONG[d.weekday] + (d.holiday ? ` (${d.holiday.name})` : "");
      if (isWorking(c)) {
        const s = dayShift(store, sector, e, d);
        weekMin += s.workMin;
        body.push([date, dia, "Trabalho", fmtTime(s.start), s.breakEnd > s.breakStart ? `${fmtTime(s.breakStart)}–${fmtTime(s.breakEnd)}` : "—", fmtTime(s.end)]);
      } else {
        const lab = c === "F" ? "FOLGA" : c === "V" ? "FÉRIAS" : c === "A" ? "FALTA" : c === "M" ? "ATESTADO" : "FERIADO";
        if (c === "F") {
          folgas++;
          if (d.weekday === 0) domFolga++;
        }
        body.push([date, dia, lab, "", "", ""]);
      }
      const endOfWeek = k === days.length - 1 || days[k + 1].week !== d.week;
      if (endOfWeek) {
        body.push([{ content: `Semana ${d.week + 1}: ${fmtDur(weekMin)} de trabalho`, colSpan: 6, styles: { halign: "right", fontStyle: "bold", fillColor: [244, 240, 250], textColor: [61, 26, 110] } }]);
        weekMin = 0;
      }
    });

    autoTable(doc, {
      startY: 114,
      margin: { left: 36, right: 36, bottom: 70 },
      head: [["Data", "Dia", "Situação", "Entrada", "Intervalo", "Saída"]],
      body,
      styles: { fontSize: 9.5, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, valign: "middle" },
      headStyles: { fillColor: PURPLE, textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 48 }, 2: { cellWidth: 70 }, 3: { halign: "center", cellWidth: 60 }, 4: { halign: "center", cellWidth: 90 }, 5: { halign: "center", cellWidth: 60 } },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const raw = data.row.raw as unknown[];
        const sit = Array.isArray(raw) ? String(raw[2] ?? "") : "";
        const k = sit === "FOLGA" ? "F" : sit === "FÉRIAS" ? "V" : sit === "FERIADO" ? "H" : sit === "FALTA" ? "A" : sit === "ATESTADO" ? "M" : null;
        if (k) {
          data.cell.styles.fillColor = rgbOf(cfg, k);
          data.cell.styles.textColor = k === "A" && !cfg.colors?.A ? [200, 40, 60] : inkRgb(cfg, k);
          if (k === "F" || k === "A" || k === "M") data.cell.styles.fontStyle = "bold";
        }
      },
    });
    // rodapé: resumo + assinatura
    const y = H - 52;
    doc.setFontSize(9.5);
    doc.setTextColor(80, 80, 95);
    doc.text(`${folgas} folgas no período · ${domFolga} ${domFolga === 1 ? "domingo" : "domingos"} de folga`, 36, y);
    doc.setDrawColor(150, 150, 160);
    doc.line(W - 250, y + 2, W - 36, y + 2);
    doc.text("Assinatura do colaborador", W - 250, y + 15);
  });
  return doc.output("blob");
}
