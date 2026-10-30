/** Após entrar/cadastrar, o espectador sempre escolhe o perfil ("Quem está assistindo?"). */
export function afterLoginPath(slug) {
  return `/${slug}/perfis`;
}
