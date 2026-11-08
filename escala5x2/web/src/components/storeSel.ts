/**
 * Seleção do filtro de lojas: ignora lojas que não existem mais e garante que a loja em uso
 * (a que Horários, Necessidade e Personalizar editam) esteja sempre incluída. Ordem = ordem das lojas.
 */
export function resolveStoreSel(storeIds: string[], raw: string[], current: string): string[] {
  const valid = storeIds.filter((id) => raw.includes(id));
  if (!current || valid.includes(current)) return valid.length ? valid : current ? [current] : [];
  return [current, ...valid];
}
