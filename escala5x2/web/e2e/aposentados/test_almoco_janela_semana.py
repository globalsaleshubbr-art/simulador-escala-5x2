# Almoço: janela "de hora a tal hora" respeitada, distribuição espaçada e visão da semana
import asyncio, os, re
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
def hm(s): h,m=s.split(":"); return int(h)*60+int(m)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#horarios"); await pg.wait_for_timeout(4000)
        ons = pg.locator("[id^=h-win-s-]")
        n = await ons.count()
        check("campo 'entre … e …' nos turnos", n >= 4, n)
        # o intervalo inteiro entre 11:00 e 14:00 em todos os turnos normais da Frente de Caixa
        for i in range(n):
            sid = (await ons.nth(i).get_attribute("id")).replace("h-win-s-","")
            await pg.fill(f"#h-win-s-{sid}", "11:00"); await pg.wait_for_timeout(150)
            await pg.fill(f"#h-win-e-{sid}", "14:00"); await pg.wait_for_timeout(150)
        check("um único campo de horário do intervalo", await pg.locator("[id^='h-brk-'], [id^='h-win-m-'], [id^='h-win-d-']").count() == 0)
        # gerar
        await pg.goto(URL + "#escala"); await pg.wait_for_timeout(2500)
        await pg.get_by_role("button", name="Gerar escala").first.click(); await pg.wait_for_timeout(9000)
        await pg.goto(URL + "#almoco"); await pg.wait_for_timeout(2500)
        await pg.click("#alm-ver-semana"); await pg.wait_for_timeout(1200)
        tab = pg.locator("[id^=alm-semana-tab-]").first
        check("tabela da semana aparece", await tab.count() == 1)
        alms = await tab.evaluate("t=>[...t.querySelectorAll('button[data-alm]')].map(b=>({ini:b.dataset.alm, txt:b.textContent, fora:!!b.dataset.fora, col:b.closest('td').cellIndex}))")
        com = [a for a in alms if a["ini"]]
        check("há almoços na semana", len(com) > 20, len(com))
        dentro = [a for a in com if 11*60 <= hm(a["ini"]) and hm(a["txt"].split("–")[1][:5]) <= 14*60]
        check("todos dentro da janela 11:00–14:00", len(dentro) == len(com), [a["txt"] for a in com if a not in dentro][:5])
        check("nenhum marcado fora da janela", not any(a["fora"] for a in com))
        # espalhados: em cada dia, nenhum horário com mais da metade das pessoas
        por = {}
        for a in com: por.setdefault(a["col"], []).append(a["ini"])
        pior = max(max(v.count(x) for x in set(v)) / len(v) for v in por.values())
        check("distribuídos (nenhum horário com mais de 40% da equipe do dia)", pior <= 0.4, round(pior,2))
        check("vários horários diferentes por dia", all(len(set(v)) >= 3 for v in por.values()), {k: sorted(set(v)) for k, v in por.items()})
        foot = await tab.evaluate("t=>[...t.querySelectorAll('tfoot tr')].map(r=>r.textContent)")
        check("rodapé com pico e mínimo", "Em intervalo juntos" in foot[0] and "Abaixo do mínimo" in foot[1], foot)
        await pg.locator("[id^=alm-semana-]").first.screenshot(path=D+"almoco_semana.png")
        # ‹ › anda uma semana
        d0 = await pg.input_value("#alm-date")
        await pg.get_by_role("button", name="Próxima semana").click(); await pg.wait_for_timeout(500)
        import datetime as dt
        d1 = await pg.input_value("#alm-date")
        check("› anda 7 dias", (dt.date.fromisoformat(d1)-dt.date.fromisoformat(d0)).days == 7)
        await pg.get_by_role("button", name="Semana anterior").click(); await pg.wait_for_timeout(500)
        # clicar num dia abre a grade do dia
        btn = tab.locator("button[data-alm]").nth(3)
        await btn.click(); await pg.wait_for_timeout(800)
        check("clicar abre o dia", await pg.get_attribute("#alm-ver-dia", "aria-checked") == "true")
        # turno de domingo com intervalo também aceita janela
        await pg.goto(URL + "#horarios"); await pg.wait_for_timeout(2000)
        dom = pg.locator("[id^=h-brkmin-], [id^=h-dur-]")
        check("sem erros JS", not errs, errs[:2])
        await pg.set_viewport_size({"width":390,"height":844}); await pg.goto(URL + "#almoco"); await pg.wait_for_timeout(2500)
        await pg.click("#alm-ver-semana"); await pg.wait_for_timeout(800)
        over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
