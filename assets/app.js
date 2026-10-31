
(function () {
  'use strict';
  const DATA = window.COURSE_DATA;
  const MODO = 'alumno';
  const ALUMNO = MODO === 'alumno';
  const SES = DATA.sesiones;
  const GLO = DATA.glosario.slice().sort((a, b) => a.t.localeCompare(b.t, 'es'));

  const FOLD = {á:'a',à:'a',â:'a',ä:'a',ã:'a',é:'e',è:'e',ê:'e',ë:'e',í:'i',ì:'i',î:'i',ï:'i',ó:'o',ò:'o',ô:'o',ö:'o',õ:'o',ú:'u',ù:'u',û:'u',ü:'u',ñ:'n'};
  function fold(s) {
    return String(s).toLowerCase().replace(/[áàâäãéèêëíìîïóòôöõúùûüñ]/g, (c) => FOLD[c]);
  }

  const st = { v: 'inicio', n: 1, idx: 0, paso: 0, todo: ALUMNO, q: '', buscando: false, gf: '', pendiente: undefined };
  const $app = document.getElementById('app');
  const $side = document.getElementById('side');
  const $q = document.getElementById('q');
  const wide = window.matchMedia('(min-width: 900px)');

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'cls') el.className = v;
        else if (k === 'text') el.textContent = String(v);
        else if (k === 'on') el.addEventListener(v[0], v[1]);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    const flat = [];
    const walk = (a) => {
      if (Array.isArray(a)) a.forEach(walk);
      else if (a !== null && a !== undefined && a !== false) flat.push(a);
    };
    walk(kids);
    for (const c of flat) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }
  function montar(el, arr) {
    const flat = [];
    const walk = (a) => {
      if (Array.isArray(a)) a.forEach(walk);
      else if (a !== null && a !== undefined && a !== false) flat.push(a);
    };
    walk(arr);
    el.replaceChildren(...flat);
  }

  function sesionPorN(n) { return SES.find((s) => s.n === n); }
  function slidesOf(s) { return [{ tipo: 'portada', portada: true, bloque: 'Portada', titulo: s.titulo }].concat(s.slides); }
  function itemsOf(sl) { return sl.items || []; }
  function pasosDe(sl) { if (sl.portada) return 0; return itemsOf(sl).length + (sl.destacado ? 1 : 0); }
  function nombreCorto(s) { return s.titulo.split(':')[0]; }

  // ---------- Índice de búsqueda ----------
  const INDEX = [];
  SES.forEach((s) => slidesOf(s).forEach((sl, idx) => {
    if (sl.portada) return;
    const partes = [sl.titulo, sl.intro || '', sl.destacado || ''];
    itemsOf(sl).forEach((it) => partes.push(it.h + ': ' + it.t + (it.ej ? ' ' + it.ej : '')));
    INDEX.push({ tipo: 'slide', n: s.n, idx, titulo: sl.titulo, bloque: sl.bloque, texto: partes.join(' · ') });
  }));
  GLO.forEach((g) => INDEX.push({ tipo: 'glo', titulo: g.t, texto: g.t + ' · ' + g.d }));

  function buscarEn(q) {
    const palabras = fold(q.trim()).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    const out = [];
    for (const e of INDEX) {
      const tf = fold(e.texto);
      if (!palabras.every((w) => tf.indexOf(w) >= 0)) continue;
      const tt = fold(e.titulo);
      out.push({ e, palabras, score: palabras.every((w) => tt.indexOf(w) >= 0) ? 0 : 1 });
    }
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, 80);
  }
  function fragmento(texto, palabras) {
    const tf = fold(texto);
    let k = -1, len = 0;
    for (const w of palabras) {
      const i = tf.indexOf(w);
      if (i >= 0 && (k < 0 || i < k)) { k = i; len = w.length; }
    }
    if (k < 0) return [texto.slice(0, 160) + '…'];
    const a = Math.max(0, k - 80), b = Math.min(texto.length, k + len + 120);
    return [
      a > 0 ? '…' : '',
      texto.slice(a, k),
      h('mark', { text: texto.slice(k, k + len) }),
      texto.slice(k + len, b),
      b < texto.length ? '…' : '',
    ];
  }

  // ---------- Rutas ----------
  function leerHash() {
    const hs = location.hash.replace(/^#/, '');
    const m = hs.match(/^s([1-9]\d*)(?:\/(\d+))?$/);
    if (m) {
      const n = Number(m[1]);
      const s = sesionPorN(n);
      if (s) {
        const max = slidesOf(s).length - 1;
        return { v: 'sesion', n, idx: Math.min(Number(m[2] || 0), max) };
      }
    }
    if (hs === 'casos' || hs === 'glosario' || hs === 'mapa' || hs === 'practica') return { v: hs, n: st.n, idx: 0 };
    return { v: 'inicio', n: st.n, idx: 0 };
  }
  function applyHash() {
    const nv = leerHash();
    const cambio = nv.v !== st.v || nv.n !== st.n || nv.idx !== st.idx;
    st.v = nv.v; st.n = nv.n; st.idx = nv.idx;
    if (st.pendiente !== undefined) st.paso = st.pendiente;
    else if (cambio) st.paso = 0;
    st.pendiente = undefined;
    st.q = ''; st.buscando = false; $q.value = '';
    render(cambio);
  }
  function navegar(hash, paso) {
    st.pendiente = paso || 0;
    st.q = ''; st.buscando = false; $q.value = '';
    if (location.hash === hash) applyHash();
    else location.hash = hash;
  }
  function ir(n, idx, paso) { navegar('#s' + n + '/' + idx, paso); }

  // ---------- Avance por pasos ----------
  function adelante() {
    const sls = slidesOf(sesionPorN(st.n));
    const total = pasosDe(sls[st.idx]);
    const paso = Math.min(st.paso, total);
    if (!st.todo && paso < total) { st.paso = paso + 1; render(false); return; }
    if (st.idx < sls.length - 1) ir(st.n, st.idx + 1, 0);
    else if (st.n < SES.length) ir(st.n + 1, 0, 0);
  }
  function atras() {
    const sls = slidesOf(sesionPorN(st.n));
    const total = pasosDe(sls[st.idx]);
    const paso = Math.min(st.paso, total);
    if (!st.todo && paso > 0) { st.paso = paso - 1; render(false); return; }
    if (st.idx > 0) { ir(st.n, st.idx - 1, pasosDe(sls[st.idx - 1])); return; }
    if (st.n > 1) {
      const prev = slidesOf(sesionPorN(st.n - 1));
      ir(st.n - 1, prev.length - 1, pasosDe(prev[prev.length - 1]));
    }
  }

  // ---------- Vistas ----------
  const PREG = {
    1: '¿Qué es el abuso sexual infantil y por qué cuesta tanto contarlo?',
    2: '¿Cómo responder cuando una niña o un niño decide contar?',
    3: '¿Cómo se manifiesta el trauma y cómo se interviene?',
    4: '¿Cómo se protege, se coordina y se integra todo el caso?',
    5: '¿Qué intervenciones psicológicas tienen respaldo y cómo se ajustan a cada niño?',
    6: '¿Qué lugar tienen los medicamentos y cómo se vigilan?',
  };
  function bloquesDe(s) {
    const out = [];
    slidesOf(s).forEach((sl, idx) => {
      if (sl.portada || sl.bloque === 'Inicio' || sl.bloque === 'Referencias') return;
      if (!out.length || out[out.length - 1].b !== sl.bloque) out.push({ b: sl.bloque, titulo: sl.titulo, idx });
    });
    return out;
  }
  function mapaView() {
    return h('section', { cls: 'mapa' },
      h('h2', { cls: 'mapa-tit', text: 'Mapa del curso' }),
      h('p', { cls: 'lead', text: 'El módulo avanza de comprender a proteger. Cada sesión responde una pregunta y prepara la siguiente: primero entender qué pasa y por qué cuesta contarlo, después cómo responder a una revelación, luego cómo se manifiesta el trauma y cómo se interviene, y al final cómo se protege y se integra el caso completo. Haz clic en cualquier bloque para ir directo a él.' }),
      h('ol', { cls: 'mapa-flujo' }, SES.filter((s) => s.n <= 4).map((s) => h('li', { cls: 'mapa-ses' },
        h('div', { cls: 'mapa-cab' },
          h('span', { cls: 'mapa-num', text: String(s.n) }),
          h('div', null, h('p', { cls: 'kick', text: 'Sesión ' + s.n }), h('h3', { text: nombreCorto(s) }))),
        h('p', { cls: 'mapa-preg', text: PREG[s.n] }),
        h('ul', { cls: 'mapa-bloques' }, bloquesDe(s).map((b) => h('li', null,
          h('button', { cls: 'mapa-b', on: ['click', () => ir(s.n, b.idx, 0)] },
            h('span', { cls: 'mapa-cod', text: b.b }), h('span', { text: b.titulo })))))))),
      SES.some((s) => s.n > 4) ? h('h3', { cls: 'mapa-sub', text: 'Módulos complementarios' }) : null,
      SES.some((s) => s.n > 4) ? h('p', { cls: 'lead', text: 'Profundizan en el tratamiento: primero la intervención psicológica, que es la primera línea, y después el uso prudente de medicamentos. Se recomienda verlos después de la sesión 3 o al terminar el módulo.' }) : null,
      h('ol', { cls: 'mapa-flujo extra' }, SES.filter((s) => s.n > 4).map((s) => h('li', { cls: 'mapa-ses' },
        h('div', { cls: 'mapa-cab' },
          h('span', { cls: 'mapa-num', text: String(s.n) }),
          h('div', null, h('p', { cls: 'kick', text: 'Sesión ' + s.n }), h('h3', { text: nombreCorto(s) }))),
        h('p', { cls: 'mapa-preg', text: PREG[s.n] }),
        h('ul', { cls: 'mapa-bloques' }, bloquesDe(s).map((b) => h('li', null,
          h('button', { cls: 'mapa-b', on: ['click', () => ir(s.n, b.idx, 0)] },
            h('span', { cls: 'mapa-cod', text: b.b }), h('span', { text: b.titulo })))))))),
      h('div', { cls: 'mapa-hilo' },
        h('p', { cls: 'kick', text: 'Un caso que recorre el curso' }),
        h('p', { text: 'Valeria aparece en las cuatro sesiones del módulo central: a los 9 años, cuando llega a consulta (S1); cuando le cuenta algo a la enfermera escolar (S2); tres meses después (S3), y seis meses después, en el caso integrador (S4). Seguirla te permite ver cómo cambia la lectura clínica con el tiempo y por qué ninguna decisión se toma con un solo dato.' })));
  }



  // Actividad opcional sin soluciones ni recogida de datos.
  function practicaView() {
    const caso = SES[0].slides.find(sl => sl.tipo === 'caso' && sl.titulo.includes('Mateo'));
    return [h('h1',{cls:'pag-tit',text:'Práctica de reflexión: observar antes de concluir'}),
      h('p',{cls:'lead',text:'Caso ficticio y actividad opcional. No necesitas compartir experiencias personales. No hay puntuación, diagnóstico ni almacenamiento de respuestas.'}),
      h('button',{cls:'btn',text:'Omitir y volver al inicio',on:['click',()=>navegar('#inicio',0)]}),
      h('article',{cls:'study-route'},h('h2',{text:caso.titulo}),h('p',{text:caso.intro}),
        caso.items.map(it=>h('p',{text:it.t})),
        h('p',{text:'Piensa tu respuesta en privado. Distingue lo descrito de tus interpretaciones y anota qué información falta. Puedes detenerte aquí o volver a la explicación de la sesión.'})),
      h('button',{cls:'btn',text:'Reiniciar actividad',on:['click',()=>render(false)]}),
      h('button',{cls:'btn',text:'Volver a la sesión 1',on:['click',()=>ir(1,0,0)]})];
  }

  function rutaEstudio() {
    return h('section', {cls:'study-route', 'aria-labelledby':'ruta-estudio'},
      h('h2',{id:'ruta-estudio',text:'Cómo estudiar esta cátedra'}),
      h('p',{text:'Base actual: cuatro sesiones centrales y dos complementarias. Esta edición organiza el material recibido; no acredita una formación ni sustituye supervisión clínica.'}),
      h('h3',{text:'Antes de comenzar'}),
      h('p',{text:'Revisa el glosario y los objetivos de apertura de cada sesión. Si un concepto no te resulta familiar, vuelve a su explicación antes de continuar. Los casos son ficticios y no requieren compartir experiencias personales.'}),
      h('ol',null,
        h('li',{text:'Explicación: lee el bloque y formula su idea principal con tus propias palabras.'}),
        h('li',{text:'Ejemplo y actividad: abre un caso de la sesión, identifica los datos disponibles y piensa tu respuesta en privado.'}),
        h('li',{text:'Interpretación: revisa qué parte del bloque respalda tu razonamiento y qué información sigue faltando.'}),
        h('li',{text:'Comprobación: explica qué cambiarías en tu respuesta y qué parte del bloque lo justifica. Si persiste una duda, regresa a la sesión o llévala a discusión docente.'})),
      h('p',{text:'No hay calificación automática ni almacenamiento de respuestas. Puedes recorrer los materiales a tu ritmo. El orden recomendado es 1–4 y, después, 5–6.'}),
      h('p',{text:'Bibliografía: consulta las referencias originales al final de las sesiones 4 y 6. Su vigencia y correspondencia con cada afirmación requieren revisión científica antes de la edición definitiva. Esta edición conserva esas referencias, sin añadir fuentes supuestas.'}));
  }

  function vistaInicio() {
    return [
      h('section', { cls: 'hero' },
        h('p', { cls: 'kick', text: 'Diplomado IN4 · Clínica avanzada' }),
        h('h1', { cls: 'pag-tit', text: 'Psicotrauma infantil complejo' }),
        h('p', { cls: 'lead', text: ALUMNO
          ? 'Esta es la versión para estudiar por tu cuenta. Cada diapositiva está escrita para entenderse sola: presenta una idea, la explica y dice qué implica en la práctica. Puedes seguir las sesiones en orden con los botones Anterior y Siguiente, saltar a un bloque desde el mapa, buscar un concepto en la barra superior o repasar los términos en el glosario. En los casos, intenta responder antes de avanzar: puedes llevar tus dudas a discusión en clase.'
          : 'Esta página reúne las cuatro sesiones del módulo y dos módulos complementarios, con el desarrollo completo de cada diapositiva. Sirve para proyectar y para consultar. Al proyectar, cada clic o cada flecha muestra un elemento nuevo con su explicación. Al consultar, «Mostrar todo» despliega la diapositiva completa, y la búsqueda encuentra cualquier concepto, caso o tema en las sesiones y en el glosario.' })),
      rutaEstudio(),
      h('button', {cls:'btn primario', text:'Práctica de reflexión opcional', on:['click', () => navegar('#practica', 0)]}),
      mapaView(),
      h('div', { cls: 'cards' },
        SES.map((s) => h('article', { cls: 'card-s' },
          h('p', { cls: 'kick', text: 'Sesión ' + s.n + ' · 3 horas' }),
          h('h2', { text: s.titulo }),
          h('p', { cls: 'sub', text: s.subtitulo }),
          h('p', { cls: 'meta', text: (slidesOf(s).length - 1) + ' diapositivas · ' + s.pausa }),
          h('div', { cls: 'acciones' }, h('button', { cls: 'btn primario', text: 'Abrir sesión', on: ['click', () => ir(s.n, 0, 0)] }))))),
      h('div', { cls: 'cards dos' },
        h('article', { cls: 'card-s' },
          h('h2', { text: 'Casos' }),
          h('p', { cls: 'sub', text: 'Casos ficticios de cada sesión, con preguntas para reflexionar de forma autónoma.' }),
          h('div', { cls: 'acciones' }, h('button', { cls: 'btn', text: 'Ver casos', on: ['click', () => navegar('#casos', 0)] }))),
        h('article', { cls: 'card-s' },
          h('h2', { text: 'Glosario' }),
          h('p', { cls: 'sub', text: GLO.length + ' conceptos clave con su definición y la sesión donde se trabajan.' }),
          h('div', { cls: 'acciones' }, h('button', { cls: 'btn', text: 'Abrir glosario', on: ['click', () => navegar('#glosario', 0)] }))))
    ];
  }

  function barra(sls, total, paso) {
    const info = st.idx === 0
      ? 'Portada'
      : 'Diapositiva ' + st.idx + ' de ' + (sls.length - 1) + (total && !st.todo ? ' · paso ' + paso + ' de ' + total : '');
    if (ALUMNO) return h('div', { cls: 'barra' }, h('span', { cls: 'contador', text: info }));
    return h('div', { cls: 'barra' },
      h('span', { cls: 'contador', text: info }),
      h('button', {
        cls: 'btn',
        'aria-pressed': st.todo ? 'true' : 'false',
        text: st.todo ? 'Volver a mostrar por pasos' : 'Mostrar todo',
        on: ['click', () => { st.todo = !st.todo; render(false); }],
      }));
  }

  function navPasos(sls, total, paso) {
    const hayAntes = (!st.todo && paso > 0) || st.idx > 0 || st.n > 1;
    const hayDespues = (!st.todo && paso < total) || st.idx < sls.length - 1 || st.n < SES.length;
    return h('nav', { cls: 'nav-pasos', 'aria-label': 'Avanzar y retroceder' },
      h('button', { cls: 'btn', disabled: !hayAntes, text: '← Anterior', on: ['click', atras] }),
      h('span', { cls: 'teclas', text: 'Teclas ← → y Espacio' }),
      h('button', { cls: 'btn primario', disabled: !hayDespues, text: 'Siguiente →', on: ['click', adelante] }));
  }


  function portadaView(s) {
    return h('article', { cls: 'slide portada', 'aria-labelledby': 'tit-slide' },
      h('p', { cls: 'kick', text: s.kicker }),
      h('h2', { cls: 'titulo-portada', id: 'tit-slide', tabindex: '-1', text: s.titulo }),
      h('p', { cls: 'sub-portada', text: s.subtitulo }),
      h('p', { cls: 'pausa-portada', text: s.pausa }));
  }

  function banda(texto, visible) {
    return h('div', { cls: 'banda' + (visible ? '' : ' oculto') }, h('p', { text: texto }));
  }

  function vTexto(sl, vis, dVis) {
    const cuerpo = h('div', { cls: 'texto-items' }, itemsOf(sl).map((it, i) =>
      h('div', { cls: 'item' + (vis(i) ? '' : ' oculto') }, h('h3', { text: it.h }), h('p', { text: it.t }))));
    if (!sl.destacado) return cuerpo;
    return h('div', { cls: 'con-lateral' },
      cuerpo,
      h('aside', { cls: 'lateral' + (dVis ? '' : ' oculto'), 'aria-hidden': dVis ? 'false' : 'true' },
        h('p', { text: sl.destacado })));
  }

  function vTarjetas(sl, vis, dVis) {
    const its = itemsOf(sl);
    const n = its.length;
    const cols = n <= 3 ? n : (n === 4 ? 2 : 3);
    return h('div', { cls: 'bloque-cont' },
      sl.intro ? h('p', { cls: 'intro', text: sl.intro }) : null,
      h('div', { cls: 'grid-t', style: '--cols:' + cols },
        its.map((it, i) => h('article', { cls: 'tarjeta' + (vis(i) ? '' : ' oculto') }, h('h3', { text: it.h }), h('p', { text: it.t })))),
      sl.destacado ? banda(sl.destacado, dVis) : null);
  }

  function vFlujo(sl, vis, dVis) {
    const its = itemsOf(sl);
    const kids = [];
    its.forEach((it, i) => {
      kids.push(h('article', { cls: 'paso-card' + (i === its.length - 1 ? ' final' : '') + (vis(i) ? '' : ' oculto') },
        h('h3', { text: it.h }), h('p', { text: it.t })));
      if (i < its.length - 1) kids.push(h('span', { cls: 'flecha' + (vis(i + 1) ? '' : ' oculto'), 'aria-hidden': 'true', text: '→' }));
    });
    return h('div', { cls: 'bloque-cont' },
      h('div', { cls: 'flujo' }, kids),
      sl.destacado ? banda(sl.destacado, dVis) : null);
  }

  function vContraste(sl, vis, dVis) {
    return h('div', { cls: 'bloque-cont' },
      h('div', { cls: 'contraste' }, itemsOf(sl).map((it, i) =>
        h('article', { cls: 'cont-card ' + (i === 0 ? 'a' : 'b') + (vis(i) ? '' : ' oculto') },
          h('h3', { text: it.h }),
          h('p', { text: it.t }),
          it.ej ? h('p', { cls: 'ej', text: it.ej }) : null))),
      sl.destacado ? banda(sl.destacado, dVis) : null);
  }

  function vCaso(sl, vis) {
    return h('div', { cls: 'caso' },
      h('div', { cls: 'caso-intro' }, h('span', { cls: 'etiq', text: 'Caso ficticio' }), h('p', { text: sl.intro })),
      h('div', { cls: 'caso-preg' }, itemsOf(sl).map((it, i) =>
        h('article', { cls: 'pregunta' + (vis(i) ? '' : ' oculto') }, h('h3', { text: it.h }), h('p', { text: it.t }))),
        ALUMNO ? h('p', { cls: 'caso-pista', text: 'Antes de avanzar, piensa tu respuesta en privado. Esta edición no incluye soluciones de los casos; revisa los conceptos de la sesión y lleva tus dudas a discusión en clase.' }) : null));
  }

  function slideView(s, sl, paso) {
    const its = itemsOf(sl);
    const nVis = st.todo ? its.length : Math.min(paso, its.length);
    const vis = (i) => i < nVis;
    const dVis = !!sl.destacado && (st.todo || paso > its.length);
    let cont;
    if (sl.tipo === 'texto') cont = vTexto(sl, vis, dVis);
    else if (sl.tipo === 'tarjetas') cont = vTarjetas(sl, vis, dVis);
    else if (sl.tipo === 'flujo') cont = vFlujo(sl, vis, dVis);
    else if (sl.tipo === 'contraste') cont = vContraste(sl, vis, dVis);
    else if (sl.tipo === 'caso') cont = vCaso(sl, vis);
    else cont = h('p', { text: sl.intro || '' });
    return [
      h('p', { cls: 'bloque', text: 'Sesión ' + s.n + ' · ' + sl.bloque }),
      h('h2', { cls: 'titulo', id: 'tit-slide', tabindex: '-1', text: sl.titulo }),
      cont,
    ];
  }

  function vistaSesion() {
    const s = sesionPorN(st.n);
    const sls = slidesOf(s);
    const sl = sls[st.idx];
    const total = pasosDe(sl);
    const paso = Math.min(st.paso, total);
    return [
      h('p', { cls: 'sesion-tag', text: 'Sesión ' + s.n + ' · ' + nombreCorto(s) }),
      barra(sls, total, paso),
      sl.portada ? portadaView(s) : h('article', { cls: 'slide', 'aria-labelledby': 'tit-slide' }, slideView(s, sl, paso)),
      navPasos(sls, total, paso),
    ];
  }

  function vistaCasos() {
    const bloques = SES.map((s) => {
      const sls = slidesOf(s);
      const casos = sls.map((sl, idx) => ({ sl, idx })).filter((o) => o.sl.tipo === 'caso');
      if (!casos.length) return null;
      return h('section', { cls: 'caso-sec' },
        h('h2', { text: 'Sesión ' + s.n + ' · ' + nombreCorto(s) }),
        casos.map((o) => {
          const sig = sls[o.idx + 1];
          
          return h('article', { cls: 'caso-ref' },
            h('h3', { text: o.sl.titulo }),
            h('p', { text: o.sl.intro }),
            itemsOf(o.sl).map((it) => h('p', { cls: 'preg', text: it.h + ': ' + it.t })),
            h('div', { cls: 'acciones' },
              h('button', { cls: 'btn primario', text: 'Abrir caso', on: ['click', () => ir(s.n, o.idx, 0)] }),
              null));
        }));
    });
    return [
      h('h1', { cls: 'pag-tit', text: 'Casos ficticios' }),
      h('p', { cls: 'lead', text: 'Cada caso aparece en su sesión como diapositiva. Aquí puedes ver el planteamiento y las preguntas, y volver a su sesión para revisar los conceptos. Son casos ficticios, sin detalles gráficos.' }),
      bloques,
    ];
  }

  function pintarGlosario() {
    const cont = document.getElementById('gl-lista');
    if (!cont) return;
    const f = fold(st.gf.trim());
    const lista = GLO.filter((g) => !f || fold(g.t + ' ' + g.d).indexOf(f) >= 0);
    montar(cont, [
      lista.length ? null : h('p', { cls: 'lead', text: 'Ningún término coincide con la búsqueda.' }),
      h('dl', { cls: 'glo' }, lista.map((g) => [h('dt', { text: g.t }), h('dd', { text: g.d })])),
    ]);
  }
  function vistaGlosario() {
    return [
      h('h1', { cls: 'pag-tit', text: 'Glosario' }),
      h('p', { cls: 'lead', text: 'Conceptos que se usan en las sesiones del módulo y en los módulos complementarios. Cada definición es breve; la explicación completa está en la diapositiva donde aparece el concepto.' }),
      h('div', { cls: 'filtro' },
        h('label', { cls: 'sr', 'for': 'gf', text: 'Filtrar glosario' }),
        h('input', {
          id: 'gf', type: 'search', placeholder: 'Filtrar términos…', value: st.gf,
          on: ['input', (e) => { st.gf = e.target.value; pintarGlosario(); }],
        })),
      h('div', { id: 'gl-lista' }),
    ];
  }

  function resultado(r) {
    const e = r.e;
    return h('button', { cls: 'resultado', on: ['click', () => abrirResultado(e)] },
      h('span', { cls: 'res-etiq', text: e.tipo === 'slide' ? 'Sesión ' + e.n + ' · ' + e.bloque : 'Glosario' }),
      h('strong', { text: e.titulo }),
      h('span', { cls: 'res-snip' }, fragmento(e.texto, r.palabras)));
  }
  function abrirResultado(e) {
    if (e.tipo === 'slide') { ir(e.n, e.idx, 0); return; }
    st.gf = e.titulo;
    navegar('#glosario', 0);
  }
  function vistaBusqueda() {
    const res = buscarEn(st.q);
    return [
      h('h1', { cls: 'pag-tit', text: 'Resultados para «' + st.q.trim() + '»' }),
      h('p', { cls: 'lead', text: res.length
        ? res.length + (res.length === 1 ? ' coincidencia' : ' coincidencias') + ' en diapositivas y glosario.'
        : 'Sin coincidencias. Prueba con una palabra más general o con menos palabras.' }),
      h('div', { cls: 'resultados' }, res.map((r) => resultado(r))),
    ];
  }

  // ---------- Barra lateral ----------
  function pintarSide() {
    const enSesion = (n) => st.v === 'sesion' && st.n === n;
    const bloques = [
      h('p', { cls: 'side-tit', text: 'Sesiones' }),
      h('div', { cls: 'nav-sesiones' }, SES.map((s) => h('button', {
        cls: 'nav-btn' + (enSesion(s.n) ? ' act' : ''),
        'aria-current': enSesion(s.n) ? 'page' : false,
        on: ['click', () => ir(s.n, 0, 0)],
      }, h('span', { cls: 'num', text: 'S' + s.n }), h('span', { cls: 'nom', text: nombreCorto(s) + (s.n > 4 ? ' (complementario)' : '') })))),
      h('p', { cls: 'side-tit', text: 'Consulta' }),
      h('div', { cls: 'nav-sesiones' },
        h('button', { cls: 'nav-btn' + (st.v === 'inicio' ? ' act' : ''), on: ['click', () => navegar('#inicio', 0)] }, h('span', { cls: 'nom', text: 'Inicio' })),
        h('button', { cls: 'nav-btn' + (st.v === 'mapa' ? ' act' : ''), on: ['click', () => navegar('#mapa', 0)] }, h('span', { cls: 'nom', text: 'Mapa del curso' })),
        h('button', { cls: 'nav-btn' + (st.v === 'casos' ? ' act' : ''), on: ['click', () => navegar('#casos', 0)] }, h('span', { cls: 'nom', text: 'Casos' })),
        h('button', { cls: 'nav-btn' + (st.v === 'glosario' ? ' act' : ''), on: ['click', () => navegar('#glosario', 0)] }, h('span', { cls: 'nom', text: 'Glosario' }))),
    ];
    if (st.v === 'sesion') {
      const sls = slidesOf(sesionPorN(st.n));
      bloques.push(h('details', { cls: 'indice', open: wide.matches },
        h('summary', { text: 'Diapositivas (' + (sls.length - 1) + ')' }),
        h('ul', { cls: 'lista-dias' }, sls.map((sl, i) => h('li', null,
          h('button', {
            cls: 'dia' + (i === st.idx ? ' act' : ''),
            'aria-current': i === st.idx ? 'true' : false,
            on: ['click', () => ir(st.n, i, 0)],
          }, h('span', { cls: 'dn', text: sl.portada ? '•' : String(i) }), h('span', { cls: 'dt', text: sl.titulo })))))));
    }
    montar($side, bloques);
  }

  // ---------- Render ----------
  function render(cambio) {
    if (st.buscando) montar($app, vistaBusqueda());
    else if (st.v === 'sesion') montar($app, vistaSesion());
    else if (st.v === 'casos') montar($app, vistaCasos());
    else if (st.v === 'practica') montar($app, practicaView());
    else if (st.v === 'mapa') montar($app, [mapaView()]);
    else if (st.v === 'glosario') { montar($app, vistaGlosario()); pintarGlosario(); }
    else montar($app, vistaInicio());
    pintarSide();
    document.title = st.v === 'sesion'
      ? 'Sesión ' + st.n + ' · ' + nombreCorto(sesionPorN(st.n)) + ' · Psicotrauma infantil'
      : (ALUMNO ? 'Psicotrauma infantil · Estudio' : 'Psicotrauma infantil complejo');
    if (cambio) window.scrollTo(0, 0);
  }

  // ---------- Eventos ----------
  $q.addEventListener('input', (e) => {
    st.q = e.target.value;
    st.buscando = st.q.trim().length >= 2;
    render(false);
  });
  $q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { st.q = ''; st.buscando = false; $q.value = ''; render(false); }
  });
  document.addEventListener('keydown', (e) => {
    if (st.v !== 'sesion' || st.buscando) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,select,button,a,summary')) return;
    if (e.key === ' ' && st.todo) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); adelante(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); atras(); }
    else if (e.key === 'Home') { e.preventDefault(); ir(st.n, 0, 0); }
    else if (e.key === 'End') { e.preventDefault(); ir(st.n, slidesOf(sesionPorN(st.n)).length - 1, 0); }
  });
  window.addEventListener('hashchange', applyHash);

  applyHash();
})();
