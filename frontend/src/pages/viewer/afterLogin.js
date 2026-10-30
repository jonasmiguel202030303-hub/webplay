/**
 * Decide para onde ir após entrar/cadastrar: com um único perfil, seleciona e segue;
 * com vários (ou nenhum salvo), abre a escolha de perfil.
 */
export function afterLoginPath(slug, profiles, selectProfile, from) {
  const target = from && from.startsWith(`/${slug}`) && !from.startsWith(`/${slug}/entrar`) ? from : `/${slug}`;
  if (profiles.length === 1) {
    selectProfile(profiles[0].id);
    return target;
  }
  return `/${slug}/perfis`;
}
