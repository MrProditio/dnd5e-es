/**
 * preserve-babele.js
 * - Instálalo como parte de un módulo (scripts/preserve-babele.js) o ejecútalo como macro GM
 * - Registra converters para Babele que hacen merges "seguros" en lugar de sobrescribir objetos complejos.
 *
 * Requisitos:
 * - Tener instalado y activo Babele.
 * - Cargar este script en init (Hooks.once("init", ...)) antes de que Babele aplique ficheros.
 *
 * NOTA: adapta las rutas/nombrado de campos si tu exportación usa una forma distinta.
 */
Hooks.once("init", () => {
  if (!game?.babele) {
    console.warn("Babele no disponible: el módulo preservador no se registró.");
    return;
  }

  // Util helpers
  const lc = s => (typeof s === "string" ? s.toLowerCase().trim() : "");
  const clone = obj => foundry.utils.deepClone(obj);

  /** Merge seguro para flags: merge profundo sin borrar keys no mencionadas en la traducción */
  function safeMergeFlags(sourceFlags = {}, translationFlags = {}) {
    return foundry.utils.mergeObject(clone(sourceFlags), clone(translationFlags), { inplace: false });
  }

  /** Actualiza un ActiveEffect existente con únicamente los campos textuales de la traducción */
  function applyEffectTextFields(targetEffect, transEff) {
    // transEff típicamente contiene 'name' y/o 'description' según exportación Babele
    if (transEff.name) targetEffect.label = transEff.name;
    if (transEff.icon) targetEffect.icon = transEff.icon;
    // Many systems store a description for the effect inside flags or a nested field;
    // conservador: guardamos la descripción dentro de targetEffect.flags.babele.description
    if (transEff.description) {
      targetEffect.flags = targetEffect.flags || {};
      targetEffect.flags.babele = targetEffect.flags.babele || {};
      targetEffect.flags.babele.description = transEff.description;
      // si el efecto original ya tenía flags de sistema, preservarlas sin sobrescribir
    }
  }

  /** Merge seguro para effects
   * sourceEffects puede ser Array (documentos ActiveEffect) o similar.
   * translationEffects suele venir en forma de objeto { "Label or ID": { name, description } }
   */
  function safeMergeEffects(sourceEffects, translationEffects) {
    const out = Array.isArray(sourceEffects) ? clone(sourceEffects) : (sourceEffects ? clone(Object.values(sourceEffects)) : []);

    if (!translationEffects) return out;

    // Permitir que la traducción venga como array o como objeto mapeado
    const translations = Array.isArray(translationEffects)
      ? translationEffects
      : Object.entries(translationEffects).map(([k, v]) => ({ _key: k, ...v }));

    // Índice por label y por _id (si existe)
    const index = new Map();
    out.forEach((e, i) => {
      const keyCandidates = [e.label, e.name, e._id, e.id].filter(Boolean).map(x => lc(x));
      keyCandidates.forEach(k => index.set(k, i));
    });

    translations.forEach(te => {
      const tKeyCandidates = [te._key, te.name, te.label, te.id].filter(Boolean).map(x => lc(x));
      let found = null;
      for (const k of tKeyCandidates) {
        if (index.has(k)) { found = index.get(k); break; }
      }
      if (found !== null) {
        // Actualizamos SOLO los campos textuales sin tocar changes/duration/transfer...
        applyEffectTextFields(out[found], te);
      } else {
        // No existe: añadimos un efecto mínimo (opcional). Si prefieres no insertar, comenta estas líneas.
        const newEff = {
          label: te.name || te._key || "Unnamed Effect",
          icon: te.icon || "icons/svg/mystery-man.svg",
          changes: te.changes || [],
          duration: te.duration || {},
          disabled: te.disabled || false,
          flags: te.flags || {}
        };
        if (te.description) {
          newEff.flags = newEff.flags || {};
          newEff.flags.babele = newEff.flags.babele || {};
          newEff.flags.babele.description = te.description;
        }
        index.set(lc(newEff.label), out.length);
        out.push(newEff);
      }
    });

    return out;
  }

  /** Merge seguro para arrays de embedded documents (items, features, etc.)
   * translationEmbedded suele venir como objeto mapeado por nombre/id con sólo campos traducidos.
   */
  function safeMergeEmbedded(sourceEmbedded = [], translationEmbedded = {}) {
    const out = Array.isArray(sourceEmbedded) ? clone(sourceEmbedded) : (sourceEmbedded ? clone(Object.values(sourceEmbedded)) : []);
    if (!translationEmbedded) return out;

    const translations = Array.isArray(translationEmbedded)
      ? translationEmbedded
      : Object.entries(translationEmbedded).map(([k, v]) => ({ _key: k, ...v }));

    // index by name/_id
    const idx = new Map();
    out.forEach((e, i) => {
      const keys = [e.name, e._id, e.id].filter(Boolean).map(x => lc(x));
      keys.forEach(k => idx.set(k, i));
    });

    translations.forEach(te => {
      const keys = [te._key, te.name, te.id].filter(Boolean).map(x => lc(x));
      let found = null;
      for (const k of keys) if (idx.has(k)) { found = idx.get(k); break; }
      if (found !== null) {
        // Aplicar únicamente campos textuales y descripciones dentro de system.* conservando todo lo demás
        const target = out[found];
        if (te.name) target.name = te.name;
        // Si tienes system.description.value traducido:
        if (te.system && te.system.description && typeof te.system.description.value === "string") {
          target.system = target.system || {};
          target.system.description = target.system.description || {};
          target.system.description.value = te.system.description.value;
        }
        // Si quieres añadir más caminos de texto, añade aquí las asignaciones puntuales
      } else {
        // No existe: crear mínimo si quieres (opcional)
        const newItem = {
          name: te.name || te._key || "Unnamed",
          type: te.type || "item",
          system: te.system || {},
          flags: te.flags || {}
        };
        out.push(newItem);
        idx.set(lc(newItem.name), out.length - 1);
      }
    });

    return out;
  }

  /** Merge para actividades (estructura simple según tu ejemplo) */
  function safeMergeActivities(sourceActivities = {}, translationActivities = {}) {
    if (!translationActivities) return sourceActivities;
    const out = clone(sourceActivities || {});
    for (const [k, v] of Object.entries(translationActivities)) {
      if (!out[k]) {
        // si no existe la actividad, la añadimos (opcional)
        out[k] = v;
      } else {
        // solo sustituimos el name si viene
        if (v.name) out[k].name = v.name;
      }
    }
    return out;
  }

  /** Converter general que fusiona una entidad completa (actor/item/journal) */
  function safeMergeEntity(source, translation) {
    if (!translation) return source;
    const out = clone(source);

    // Recorremos las claves enviadas por la traducción y actuamos por propiedad
    for (const [k, v] of Object.entries(translation)) {
      if (v === null || v === undefined) continue;

      // Campos manejados especialmente:
      if (k === "effects") { out.effects = safeMergeEffects(source.effects, v); continue; }
      if (k === "items" || k === "features" || k === "embeddedItems") { out.items = safeMergeEmbedded(source.items || source.embeddedItems || [], v); continue; }
      if (k === "activities" || k === "system.activities") {
        // si la traducción te da system.activities, la ruta depende de cómo exportes; intentamos dos variantes:
        out.activities = safeMergeActivities(source.activities || {}, v);
        if (out.system) out.system.activities = safeMergeActivities((source.system && source.system.activities) || {}, v);
        continue;
      }
      if (k === "flags") { out.flags = safeMergeFlags(source.flags || {}, v); continue; }

      // Campos textuales o sencillos: aplicarlos directamente (name, description, etc.)
      // Si es un objeto profundo (p.ej. system.description.value) Babele pasará esa clave si la mapeas en mapping;
      // no hacemos un merge profundo genérico para no eliminar subcampos del sistema.
      out[k] = v;
    }

    return out;
  }

  // Registramos converters: los nombres son los que usarás en el mapping JSON
  try {
    game.babele.registerConverters({
      safeMergeEntity,
      safeMergeEffects,
      safeMergeEmbedded,
      safeMergeActivities,
      safeMergeFlags
    });
    console.log("Babele converters 'safeMerge*' registrados: preserve-babele.js");
  } catch (err) {
    console.error("Error registrando converters en Babele:", err);
  }
});
