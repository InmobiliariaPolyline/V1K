// Aplica el tema y la densidad guardados antes de que el navegador pinte (evita el parpadeo claro/oscuro).
// Es un archivo aparte (y sin módulos) porque la CSP no permite scripts en línea.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('v1k-prefs') || '{}');
    var raiz = document.documentElement;
    if (p.tema === 'claro' || p.tema === 'oscuro' || p.tema === 'auto') raiz.setAttribute('data-tema', p.tema);
    if (p.densidad === 'compacta' || p.densidad === 'comoda') raiz.setAttribute('data-densidad', p.densidad);
  } catch (e) { /* sin almacenamiento: se queda el valor por defecto */ }
})();
