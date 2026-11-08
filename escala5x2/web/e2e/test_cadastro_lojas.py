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
        # atalho no filtro de lojas do menu
        await pg.click("#store-filter"); await pg.click("#store-manage"); await pg.wait_for_timeout(800)
        check("atalho do menu abre Lojas", (await pg.inner_text("h1")).strip() == "Lojas")
        # uma loja copiando de outra: regras e montagem da escala, sem funcionários
        check("sem a opção de copiar funcionários", await pg.locator("#ns-mode-tudo").count() == 0)
        await pg.fill("#ns-names", "Loja 2 — Shopping"); await pg.click("#ns-mode-estrutura"); await pg.wait_for_timeout(200)
        await pg.click("#ns-create"); await pg.wait_for_timeout(800)
        rows = await pg.locator("#store-list tbody tr").count()
        check("loja criada na lista", rows == 2, rows)
        t = await pg.inner_text("#store-list")
        cnt = await pg.locator("#store-list tbody tr").nth(1).locator("td").nth(2).inner_text()
        check("cópia sem funcionários", cnt.strip() == "0", cnt)
        check("loja nova fica em edição", "Shopping" in await pg.inner_text("#store-filter"))
        # várias de uma vez, só estrutura
        await pg.fill("#ns-names", "Loja 3\nLoja 4\nLoja 5"); await pg.click("#ns-mode-estrutura")
        btn = await pg.inner_text("#ns-create")
        check("botão diz quantas", "3 lojas" in btn, btn)
        await pg.click("#ns-create"); await pg.wait_for_timeout(800)
        check("5 lojas na lista", await pg.locator("#store-list tbody tr").count() == 5)
        # em branco com setores escolhidos
        await pg.fill("#ns-names", "Loja 6"); await pg.click("#ns-mode-branco"); await pg.wait_for_timeout(200)
        await pg.locator("#ns-secs button", has_text="Depósito").click()
        await pg.click("#ns-create"); await pg.wait_for_timeout(800)
        check("6 lojas", await pg.locator("#store-list tbody tr").count() == 6)
        # renomear e duplicar
        name = pg.locator("#store-list tbody tr").nth(2).locator("input[aria-label='Nome da loja']")
        await name.fill("Loja 3 — Bairro"); await name.press("Tab"); await pg.wait_for_timeout(300)
        check("renomear na lista", "Loja 3 — Bairro" in await pg.inner_text("#store-filter") or await pg.locator("input[value='Loja 3 — Bairro']").count() >= 1)
        await pg.locator("#store-list tbody tr").nth(0).get_by_role("button", name="Duplicar").click(); await pg.wait_for_timeout(600)
        check("duplicar", await pg.locator("#store-list tbody tr").count() == 7)
        cnt = await pg.locator("#store-list tbody tr").nth(6).locator("td").nth(2).inner_text()
        check("duplicar não copia funcionários", cnt.strip() == "0", cnt)
        # nas telas: filtro de lojas mostra as novas
        txt = await pg.inner_text("#store-filter")
        check("lojas novas aparecem nas telas", "lojas selecionadas" in txt, txt)
        # editar outra loja
        await pg.locator("#store-list tbody tr").nth(0).get_by_role("button", name="Editar").click(); await pg.wait_for_timeout(300)
        check("editar troca a loja em edição", "Centro" in await pg.inner_text("#store-filter") or "em edição: Loja 1" in await pg.inner_text("#store-filter"))
        # excluir
        n0 = await pg.locator("#store-list tbody tr").count()
        last = pg.locator("#store-list tbody tr").last
        await last.get_by_role("button", name="Excluir").click(); await last.get_by_role("button", name=re.compile("Excluir .* e todos")).click(); await pg.wait_for_timeout(500)
        check("excluir loja", await pg.locator("#store-list tbody tr").count() == n0 - 1)
        await pg.screenshot(path=D+"lojas_page.png", full_page=True)
        # persistência
        await pg.reload(); await pg.wait_for_timeout(3500); await go("lojas")
        check("lojas salvas após recarregar", await pg.locator("#store-list tbody tr").count() == n0 - 1)
        # Personalizar aponta para Lojas
        await go("personalizar")
        check("Personalizar tem atalho para Lojas", await pg.locator("#p-stores").count() == 1)
        await pg.set_viewport_size({"width":390,"height":844}); await go("lojas")
        sw = await pg.evaluate("document.documentElement.scrollWidth")
        if sw > 392: print(await pg.evaluate("""(()=>{const out=[];for(const el of document.querySelectorAll('body *')){const r=el.getBoundingClientRect(); if(r.right>392 && !el.closest('.scroll-x') && !el.closest('nav')) out.push([el.tagName, el.id, el.className.toString().slice(0,80), Math.round(r.right)]);} return out.slice(0,8)})()"""))
        check("celular sem rolagem lateral", sw <= 392, sw)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
