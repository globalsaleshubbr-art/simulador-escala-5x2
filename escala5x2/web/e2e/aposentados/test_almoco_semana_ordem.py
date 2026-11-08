# Almoços da semana: escolher a ordem
import asyncio, os
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
def hm(s): h,m=s.split(":"); return int(h)*60+int(m)
ROWS="t=>[...t.querySelectorAll('tbody tr')].map(r=>({nome:r.querySelector('th').childNodes[0].textContent.trim(), cel:[...r.querySelectorAll('td')].map(td=>{const b=td.querySelector('button[data-alm]');return b?b.dataset.alm:null})}))"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#almoco"); await pg.wait_for_timeout(4000)
        await pg.click("#alm-ver-semana"); await pg.wait_for_timeout(1000)
        sel = pg.locator("[id^=alm-sem-ord-]").first
        tab = pg.locator("[id^=alm-semana-tab-]").first
        check("padrão: horário de entrada", await sel.input_value() == "entrada")
        opts = await sel.evaluate("s=>[...s.options].map(o=>o.textContent)")
        check("opções de ordem", "Horário do almoço na semana" in opts and "Nome (A–Z)" in opts and any(o.startswith("Almoço na ") for o in opts), opts)
        # nome
        await sel.select_option("nome"); await pg.wait_for_timeout(400)
        r = await tab.evaluate(ROWS); nomes = [x["nome"] for x in r]
        exp = await pg.evaluate("n=>[...n].sort((a,b)=>a.toLocaleLowerCase('pt-BR').localeCompare(b.toLocaleLowerCase('pt-BR'),'pt-BR'))", nomes)
        check("Nome (A–Z)", nomes == exp, nomes[:4])
        await pg.locator("[id^=alm-sem-dir-desc-]").first.click(); await pg.wait_for_timeout(400)
        r = await tab.evaluate(ROWS)
        check("Nome decrescente", [x["nome"] for x in r] == list(reversed(exp)))
        # almoço num dia: crescente, quem não almoça no fim
        val = [o for o in await sel.evaluate("s=>[...s.options].map(o=>o.value)") if o.startswith("dia:")][1]
        await sel.select_option(val); await pg.wait_for_timeout(400)
        r = await tab.evaluate(ROWS)
        idx = [o for o in await sel.evaluate("s=>[...s.options].map(o=>o.value)")].index(val)
        col = [x for x in await tab.evaluate("t=>[...t.querySelectorAll('thead th')].map(h=>h.textContent)")]
        # coluna do dia escolhido
        dia = val[4:]; dd = f"{dia[8:10]}/{dia[5:7]}"
        ci = next(i for i,h in enumerate(col) if dd in h) - 1
        vals = [x["cel"][ci] for x in r]
        tem = [v for v in vals if v]
        check("almoço do dia em ordem crescente", [hm(v) for v in tem] == sorted(hm(v) for v in tem), tem[:6])
        check("sem almoço no dia vai para o fim", all(v is None for v in vals[len(tem):]), vals)
        check("volta a crescente ao trocar de ordem", await pg.get_attribute("[id^=alm-sem-dir-asc-]", "aria-checked") == "true")
        await pg.locator("[id^=alm-semana-]").first.screenshot(path=D+"almoco_semana_ordem.png")
        # entrada de novo: decrescente inverte a lista, mesmo quando todos entram no mesmo horário
        await sel.select_option("entrada"); await pg.wait_for_timeout(400)
        asc = [x["nome"] for x in await tab.evaluate(ROWS)]
        await pg.locator("[id^=alm-sem-dir-desc-]").first.click(); await pg.wait_for_timeout(400)
        des = [x["nome"] for x in await tab.evaluate(ROWS)]
        check("entrada: decrescente inverte a lista", des == list(reversed(asc)) and des != asc, (asc[:3], des[:3]))
        # almoço na semana: crescente pelo horário que a pessoa mais teve na semana
        await sel.select_option("almoco"); await pg.wait_for_timeout(400)
        r = await tab.evaluate(ROWS)
        def comum(cel):
            v = [hm(x) for x in cel if x]
            return min(set(v), key=lambda t: (-v.count(t), t)) if v else None
        cs = [comum(x["cel"]) for x in r]
        tem = [c for c in cs if c is not None]
        check("almoço na semana em ordem crescente", tem == sorted(tem) and len(set(tem)) >= 2, tem[:8])
        await pg.locator("[id^=alm-sem-dir-desc-]").first.click(); await pg.wait_for_timeout(400)
        cs2 = [comum(x["cel"]) for x in await tab.evaluate(ROWS)]
        tem2 = [c for c in cs2 if c is not None]
        check("almoço na semana decrescente", tem2 == sorted(tem2, reverse=True), tem2[:8])
        check("sem erros JS", not errs, errs[:2])
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(400)
        over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
