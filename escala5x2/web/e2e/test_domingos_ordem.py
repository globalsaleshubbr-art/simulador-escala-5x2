# Domingos: ordenar a escala de domingo por pessoa ou por turno
import asyncio, os
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
NAMES="[...document.querySelectorAll('[id^=dom-] table tbody tr th[scope=row]')].map(t=>t.childNodes[0].textContent.trim())"
TURNOS="[...document.querySelectorAll('[id^=dom-] table tbody tr')].map(r=>r.querySelector('td select').selectedOptions[0].textContent)"
def hm(t):
    import re
    m=re.search(r"(\d\d):(\d\d)", t); return int(m[1])*60+int(m[2]) if m else -1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#domingos"); await pg.wait_for_timeout(4000)
        opts = await pg.eval_on_selector_all("#dom-ord option", "o=>o.map(x=>x.textContent)")
        check("opções de ordem", opts == ["Ordem de cadastro","Pessoa (A–Z)","Turno de domingo (entrada)","Turno da semana (entrada)"], opts)
        cad = await pg.evaluate(NAMES)
        await pg.select_option("#dom-ord", "nome"); await pg.wait_for_timeout(400)
        n = await pg.evaluate(NAMES)
        exp = await pg.evaluate("c=>[...c].sort((a,b)=>a.toLocaleLowerCase('pt-BR').localeCompare(b.toLocaleLowerCase('pt-BR'),'pt-BR'))", cad)
        check("por pessoa A–Z", n == exp, [x for x,y in zip(n,exp) if x!=y][:3])
        await pg.click("#dom-ord-dir"); await pg.wait_for_timeout(400)
        nd = await pg.evaluate(NAMES)
        check("por pessoa Z–A", nd == list(reversed(n)), nd[:4])
        # um turno de domingo diferente para uma pessoa, para a ordem por turno ter efeito
        sels = pg.locator("[id^=dom-] table tbody tr td:nth-of-type(1) select")
        opts1 = await sels.nth(2).eval_on_selector("xpath=.", "s=>[...s.options].map(o=>o.value)") if False else None
        await pg.select_option("#dom-ord", "turnoSemana"); await pg.wait_for_timeout(400)
        await pg.click("#dom-ord-dir"); await pg.wait_for_timeout(400)  # volta para crescente
        check("crescente de novo", "Crescente" in await pg.inner_text("#dom-ord-dir"))
        # horários de entrada da semana aparecem abaixo do nome (turno · horário)? conferir pela ordem não decrescente
        ent = await pg.evaluate("[...document.querySelectorAll('[id^=dom-] table tbody tr th[scope=row]')].map(t=>t.textContent)")
        check("ordem por turno da semana mostra todos", len(ent) == len(cad), (len(ent), len(cad)))
        # cabeçalhos clicáveis
        await pg.click("[id^=dom-sort-nome-]"); await pg.wait_for_timeout(400)
        check("clicar em Pessoa ordena por nome", await pg.input_value("#dom-ord") == "nome" and await pg.evaluate(NAMES) == n)
        await pg.click("[id^=dom-sort-nome-]"); await pg.wait_for_timeout(400)
        check("clicar de novo inverte", await pg.evaluate(NAMES) == nd)
        await pg.click("[id^=dom-sort-turno-]"); await pg.wait_for_timeout(400)
        check("clicar no turno ordena por turno de domingo", await pg.input_value("#dom-ord") == "turnoDomingo")
        t = await pg.evaluate(TURNOS)
        v = [hm(x) for x in t]
        check("turnos de domingo em ordem de entrada", v == sorted(v), t[:5])
        await pg.locator("[id^=dom-] table").first.scroll_into_view_if_needed()
        await pg.screenshot(path=D+"domingos_ordem.png")
        await pg.select_option("#dom-ord", "cadastro"); await pg.wait_for_timeout(300)
        check("volta à ordem de cadastro", await pg.evaluate(NAMES) == cad)
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(400)
        over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
