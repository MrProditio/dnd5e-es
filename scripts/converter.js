/**
 * safe-merge-converter.js
 * Converter para Babele: fusiona traducciones sin sobrescribir datos internos de Item5e
 */

Hooks.once("init", () => {
  if (!game?.babele) {
    console.warn("Babele no disponible: el converter no se registró.");
    return;
  }

  const clone = obj => foundry.utils.deepClone(obj);

  /** Actualiza solo los campos textuales de un efecto activo */
  function applyEffectTextFields(targetEffect, transEff) {
    if (transEff.name) targetEffect.label = transEff.name;
    if (transEff.description) {
      targetEffect.flags = targetEffect.flags || {};
      targetEffect.flags.dnd5e = targetEffect.flags.dnd5e || {};
      targetEffect.flags.dnd5e.description = transEff.description;
    }
  }

  /** Merge seguro de efectos activos */
  function safeMergeEffects(sourceEffects, translationEffects) {
    const out = clone(sourceEffects.contents || []);
    if (!translationEffects) return out;

    const translations = Array.isArray(translationEffects)
      ? translationEffects
      : Object.entries(translationEffects).map(([k, v]) => ({ _key: k, ...v }));

    const index = new Map();
    out.forEach((e, i) => index.set(e.label.toLowerCase(), i));

    translations.forEach(te => {
      const key = (te.name || te._key).toLowerCase();
      if (index.has(key)) {
        applyEffectTextFields(out[index.get(key)], te);
      } else {
        // Añadir efecto mínimo si no existía
        const newEff = {
          label: te.name || te._key || "Unnamed Effect",
          icon: te.icon || "icons/svg/mystery-man.svg",
          changes: [],
          duration: {},
          disabled: false,
          flags: te.flags || {}
        };
        if (te.description) {
          newEff.flags = newEff.flags || {};
          newEff.flags.dnd5e = newEff.flags.dnd5e || {};
          newEff.flags.dnd5e.description = te.description;
        }
        out.push(newEff);
      }
    });

    return out;
  }

  /** Merge seguro de actividades */
  function safeMergeActivities(sourceActivities = {}, translationActivities = {}) {
    const out = clone(sourceActivities);
    for (const [k, v] of Object.entries(translationActivities)) {
      if (!out[k]) {
        out[k] = v;
      } else if (v.name) {
        out[k].name = v.name;
      }
    }
    return out;
  }

  /** Merge seguro de avances */
  function safeMergeAdvancement(sourceAdv = {}, translationAdv = {}) {
    const out = clone(sourceAdv);
    if (!translationAdv.byId) return out;

    for (const [id, adv] of Object.entries(translationAdv.byId)) {
      out.byId = out.byId || {};
      out.byId[id] = out.byId[id] || {};
      if (adv.title) out.byId[id].title = adv.title;
      if (adv.hint) out.byId[id].hint = adv.hint;
    }
    return out;
  }

  /** Converter general para fusionar un Item5e completo */
  function safeMergeEntity(source, translation) {
    if (!translation) return source;
    const out = clone(source);

    // Nombre y descripción
    if (translation.name) out.name = translation.name;
    if (translation.system?.description?.value) out.system.description.value = translation.system.description.value;

    // Efectos activos
    if (translation.effects) {
      out.effects = safeMergeEffects(source.effects, translation.effects);
    }

    // Actividades
    if (translation.activities) {
      out.system.activities = safeMergeActivities(source.system.activities, translation.activities);
    }

    // Avances
    if (translation.system?.advancement) {
      out.system.advancement = safeMergeAdvancement(source.system.advancement, translation.system.advancement);
    }

    return out;
  }

  // Registrar converters en Babele
  game.babele.registerConverters({
    safeMergeEntity,
    safeMergeEffects,
    safeMergeActivities,
    safeMergeAdvancement
  });

  console.log("✅ Converter safeMergeEntity registrado en Babele");
});
