import asyncio, re
from playwright.async_api import async_playwright
import os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D+"exp", exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(name, cond, info=""):
    (ok if cond else fail).append(name + ("" if cond else f"  [{info}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h):
            await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(4000)
        # ---------- cores
        await go("personalizar")
        await pg.click("#cor-F"); await pg.click("#cores details:has(#cor-F) [aria-label='Cor #1baf7a']")
        await pg.wait_for_timeout(300)
        v = await pg.evaluate("getComputedStyle(document.querySelector('[style*=\"--c-F\"]')).getPropertyValue('--c-F').trim()")
        check("cor da folga personalizada aplicada", v.lower()=="#1baf7a", v)
        await pg.screenshot(path=D+"m_cores.png", full_page=False, clip={"x":0,"y":0,"width":1440,"height":1000})
        el = await pg.query_selector("#cores"); await el.scroll_into_view_if_needed(); await el.screenshot(path=D+"m_cores.png")
        # ---------- segunda loja
        await go("lojas"); await pg.fill("#ns-names", "Loja 2"); await pg.click("#ns-create"); await pg.wait_for_timeout(600); await go("personalizar"); await pg.wait_for_timeout(800)
        nstores = await pg.evaluate("document.querySelectorAll('#p-store-pick option').length")
        check("segunda loja criada", nstores==2, nstores)
        await go("equipe")
        await pg.get_by_role("button", name="Adicionar várias").click()
        await pg.fill("#bulk-names", "Ana Teste\nBruno Teste\nCarla Teste\nDiego Teste")
        await pg.get_by_role("button", name=re.compile("Adicionar 4")).click(); await pg.wait_for_timeout(600)
        # selecionar todas as lojas
        await pg.click("#store-filter"); await pg.get_by_role("button", name="Selecionar todas").click(); await pg.keyboard.press("Escape")
        await pg.wait_for_timeout(600)
        txt = await pg.inner_text("#store-filter")
        check("filtro mostra 2 lojas", "2 lojas" in txt, txt)
        # equipe com 2 blocos
        n = await pg.evaluate("document.querySelectorAll('section[data-store]').length")
        check("Equipe mostra um bloco por loja", n==2, n)
        await pg.fill("#eq-q", "Teste"); await pg.wait_for_timeout(300)
        rows = await pg.evaluate("[...document.querySelectorAll('section[data-store]')].map(s=>s.querySelectorAll('tbody tr').length)")
        check("busca da Equipe filtra nas duas lojas", sorted(rows)==[0,4] or rows.count(4)==1, rows)
        await pg.fill("#eq-q", "")
        await pg.select_option("#eq-func", index=1); await pg.wait_for_timeout(300)
        await pg.screenshot(path=D+"m_equipe.png", full_page=True)
        # escala: sem gráfico de pizza e sem resumo (foram para Dashboards)
        await go("escala")
        check("Escala sem pizza e sem resumo", await pg.locator("#pie-group").count()==0 and await pg.locator("#stores-summary").count()==0)
        names = await pg.inner_text("#semana")
        check("Semana identifica as lojas", "Loja 2" in names)
        await go("dashboards:lojas")
        check("Dashboards mostra o resumo das lojas", await pg.is_visible("#stores-summary"))
        rcount = await pg.evaluate("document.querySelectorAll('#stores-summary tbody tr').length")
        check("resumo com linhas das duas lojas", rcount>=2, rcount)
        await go("dashboards:colaboradores")
        await pg.select_option("#pie-group", "funcao"); await pg.select_option("#pie-store", "separadas"); await pg.wait_for_timeout(300)
        pies = await pg.evaluate("document.querySelectorAll('svg[role=img]').length")
        check("gráfico por função, uma pizza por loja", pies>=2, pies)
        await go("escala")
        await pg.screenshot(path=D+"m_escala.png", full_page=True)
        # mes
        await go("mes") if await pg.evaluate("!!document.querySelector('#mes')")==False else None
        mes_txt = await pg.inner_text("#mes") if await pg.query_selector("#mes") else ""
        check("Mês mostra as duas lojas", "Loja 2" in mes_txt)
        # domingos
        await go("domingos")
        n = await pg.evaluate("document.querySelectorAll('[id^=dom-]').length")
        blocks = await pg.evaluate("[...document.querySelectorAll('section[id^=dom-]')].filter(s=>!/dom-(copy|tpl)/.test(s.id)).length")
        check("Domingos com um bloco por loja", blocks==2, blocks)
        sel = await pg.query_selector("select[id^='dom-'][id*='-20']")
        if sel:
            sid = await sel.get_attribute("id")
            opts = await sel.evaluate("s=>[...s.options].map(o=>o.value)")
            curv = await sel.input_value()
            target = next((o for o in opts if o not in ("", "F") and o != curv), "F")
            await sel.select_option(target); await pg.wait_for_timeout(500)
            v2 = await pg.input_value("#"+sid)
            check("domingo editado à mão", v2==target, (v2,target))
        else: check("domingo editável encontrado", False)
        await pg.screenshot(path=D+"m_domingos.png", full_page=True)
        # almoço
        await go("almoco")
        blocks = await pg.evaluate("document.querySelectorAll('section[id^=alm-]').length")
        check("Almoço com um bloco por loja", blocks>=2, blocks)
        # cada pessoa com horário de almoço (fixo sugerido pelo sistema)
        txt = await pg.inner_text("main")
        check("almoço com horário de cada pessoa", "com horário fixo" in txt and await pg.locator("[id^='alm-hora-']").count() > 3)
        await pg.screenshot(path=D+"m_almoco.png", full_page=True)
        # copiar escala
        await go("horarios")
        await pg.get_by_role("button", name="Copiar escala…").click(); await pg.wait_for_timeout(300)
        dests = await pg.query_selector_all("#cp-dests button")
        check("destinos de cópia listados (inclui outra loja)", len(dests)>=2, len(dests))
        await dests[0].click()
        await pg.click("#cp-preview"); await pg.wait_for_timeout(400)
        disabled = await pg.is_disabled("#cp-apply")
        check("aplicar exige confirmação quando substitui", disabled)
        if await pg.query_selector("#cp-confirm"): await pg.check("#cp-confirm")
        await pg.click("#cp-apply"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=D+"m_copy.png", full_page=True)
        # persistência após recarregar
        await pg.reload(); await pg.wait_for_timeout(3500)
        txt = await pg.inner_text("#store-filter")
        check("seleção de lojas mantida após recarregar", "2 lojas" in txt, txt)
        await go("personalizar")
        await pg.select_option("#p-store-pick", index=0); await pg.wait_for_timeout(500)
        v = await pg.evaluate("getComputedStyle(document.querySelector('[style*=\"--c-F\"]')).getPropertyValue('--c-F').trim()")
        check("cores salvas após recarregar", v.lower()=="#1baf7a", v)
        # mobile
        await pg.set_viewport_size({"width":390,"height":844}); await go("almoco")
        sw = await pg.evaluate("document.documentElement.scrollWidth")
        check("sem rolagem horizontal no celular", sw<=392, sw)
        check("sem erros de JavaScript", not errs, errs[:3])
        await b.close()
    print("OK:", len(ok)); [print("  ✓", x) for x in ok]
    print("FALHAS:", len(fail)); [print("  ✗", x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
