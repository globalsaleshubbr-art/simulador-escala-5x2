import asyncio, re
from playwright.async_api import async_playwright
import os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D+"exp", exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("equipe")
        check("com uma loja só, sem filtro de loja", await pg.locator("#eq-store").count()==0)
        await go("lojas"); await pg.fill("#ns-names", "Loja 2"); await pg.click("#ns-create"); await pg.wait_for_timeout(600); await go("personalizar"); await pg.wait_for_timeout(600)
        await go("equipe"); await pg.get_by_role("button", name="Adicionar várias").click()
        await pg.fill("#bulk-names", "Zeca Loja2\nYara Loja2"); await pg.get_by_role("button", name=re.compile("Adicionar 2")).click(); await pg.wait_for_timeout(500)
        # menu continua só com a loja em edição; o filtro de cada tela permite ver outra loja
        main = lambda: pg.inner_text("main")
        pages = [("equipe","#eq-store"),("domingos","#dom-store"),("almoco","#alm-store"),("faltas","#ft-store"),("atestados","#ft-store"),("ferias","#vac-store")]
        for h, sel in pages:
            await go(h)
            check(f"{h}: filtro de loja aparece", await pg.locator(sel).count()==1)
            opts = await pg.eval_on_selector(sel, "s=>[...s.options].map(o=>o.textContent)")
            check(f"{h}: opções 'Todas' + cada loja", any("Todas as lojas" in o for o in opts) and any("Loja 2" in o for o in opts) and any("Centro" in o for o in opts), opts)
            # escolher a loja 1 (não está no menu)
            v1 = await pg.eval_on_selector(sel, "s=>[...s.options].find(o=>o.textContent.includes('Centro')).value")
            await pg.select_option(sel, v1); await pg.wait_for_timeout(500)
            t = await main()
            if h == "equipe": check("equipe: mostra a loja 1", "Loja 1" in t and "Zeca" not in t)
            if h == "domingos": check("domingos: mostra a loja 1", "Loja 1" in t)
            if h == "almoco": check("almoço: mostra a loja 1", "Loja 1" in t)
            if h == "ferias":
                n = await pg.locator("#vac-table tbody tr").count()
                check("férias: 60 pessoas da loja 1", n == 60, n)
                await pg.select_option(sel, "all"); await pg.wait_for_timeout(500)
                check("férias: filtro de loja no mapa e na tabela", await pg.locator("#vac-map-store").count()==1 and await pg.locator("#vac-tbl-store").count()==1)
                await pg.select_option("#vac-tbl-store", v1); await pg.wait_for_timeout(300)
                n2 = await pg.locator("#vac-table tbody tr").count()
                check("férias: tabela filtrada por loja", n2 == 60, n2)
        await go("escala")
        check("escala: filtro de loja na semana", await pg.locator("#sem-store").count()==1)
        await pg.select_option("#sem-store", "all"); await pg.wait_for_timeout(500)
        sem = await pg.inner_text("#semana")
        check("semana: as duas lojas", "Loja 1" in sem and "Loja 2" in sem)
        check("mês: filtro de loja", await pg.locator("#mes-store").count()==1)
        await pg.select_option("#mes-store", "all"); await pg.wait_for_timeout(500)
        mes = await pg.inner_text("#mes")
        check("mês: as duas lojas", "Loja 1" in mes and "Loja 2" in mes)
        await go("dashboards:lojas")
        check("resumo das lojas com filtro", await pg.locator("#sum-store").count()==1)
        await go("dashboards:colaboradores")
        check("gráfico com filtro de loja", await pg.locator("#pie-scope").count()==1)
        # navegação pelas abas dos dashboards
        await pg.locator("#dash-tabs button", has_text="Atestados").click(); await pg.wait_for_timeout(600)
        check("aba Atestados", "atestados" in (await pg.inner_text("h1")).lower())
        await pg.locator("#dash-tabs button", has_text="Faltas").click(); await pg.wait_for_timeout(600)
        check("aba Faltas", "faltas" in (await pg.inner_text("h1")).lower())
        itens = await pg.evaluate("[...document.querySelectorAll('nav[aria-label=Menu] button')].map(b=>b.innerText.split('\\n')[0].trim())")
        check("menu com Dashboards e sem Faltas/Atestados soltos", "Dashboards" in itens and "Faltas" not in itens and "Atestados" not in itens, itens)
        for h in ["horarios","necessidade"]:
            await go(h)
            check(f"{h}: escolher a loja ao lado dos setores", await pg.locator("#head-store").count()==1)
        await pg.select_option("#head-store", index=0); await pg.wait_for_timeout(400)
        check("trocar a loja em Fluxo alto muda a loja em edição", "Centro" in await pg.inner_text("#store-filter"))
        await pg.screenshot(path=D+"lojas_nec.png")
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
