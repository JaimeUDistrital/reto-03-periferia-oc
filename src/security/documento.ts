/**
 * Envoltorio para texto de documentos externos (facturas, notas, correos…): el modelo debe
 * tratarlo como DATO. Se escapan aperturas y cierres de la etiqueta dentro del texto para que
 * un documento malicioso no pueda cerrar el envoltorio ni fingir otro.
 */

function escaparAtributo(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function envolverDocumento(tipo: string, id: string, texto: string): string {
  const seguro = texto.replace(/<(\/?)(documento_externo)/gi, "&lt;$1$2");
  return `<documento_externo tipo="${escaparAtributo(tipo)}" id="${escaparAtributo(id)}">\n${seguro}\n</documento_externo>`;
}
