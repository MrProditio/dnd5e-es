/**
 * preserve-babele.js
 * - Converter completo para Babele que preserva descripciones y permite merge seguro de efectos, avances y demás.
 */

Hooks.once("init", () => {
  if (!game?.babele) {
    console.warn("Babele no disponible: el módulo preservador no se registró.");
    return;
  }

  const lc = s => (typeof s === "string" ? s.toLowerCase().trim() : "");
  const clone = obj => foundry.utils.deepClone(obj);

  /** Merge seguro para flags */
  function safeMergeFlags(sourceFlags = {}, translationFlags = {}) {
    return foundry.utils.mergeObject(clone(sourceFlags), clone(translationFlags), { inplace: false });
  }

  /** Actualiza campos textuales de un ActiveEffect */
  function applyEffectTextFields(targetEffect, transEff) {
    if (transEff.name) targetEffect.label = transEff.name;
    if (transEff.label) targetEffect.label = transEff.label;
    if (transEff.icon) targetEffect.icon = transEff.icon;

    if (transEff.description) {
      targetEffect.flags = targetEffect.flags || {};
      targetEffect.flags.babele = targetEffect.flags.babele || {};
      targetEffect.flags.babele.description = transEff.description;

      // Compatibilidad con sistemas/mods
      foundry.utils.setProperty(targetEffect, "description", transEff.description);
      foundry.utils.setProperty(targetEffect, "flags.dnd5e.description", transEff.description);
      foundry.utils.setProperty(targetEffect, "flags.core.description", transEff.description);
    }
  }

  /** Merge seguro para ActiveEffects */
  function safeMergeEffects(sourceEffects, translationEffects) {
    const out = Array.isArray(sourceEffects)
      ? clone(sourceEffects)
      : (sourceEffects ? clone(Object.values(sourceEffects)) : []);
    if (!translationEffects) return out;

    const translations = Array.isArray(translationEffects)
      ? translationEffects
      : Object.entries(translationEffects).map(([k, v]) => ({ _key: k, ...v }));

    const index = new Map();
    out.forEach((e, i) => {
      const keys = [e.label, e.name, e._id, e.id].filter(Boolean).map(lc);
      keys.forEach(k => index.set(k, i));
    });

    translations.forEach(te => {
      const keys = [te._key, te.name, te.label, te.id].filter(Boolean).map(lc);
      let found = null;
      for (const k of keys) if (index.has(k)) { found = index.get(k); break; }

      if (found !== null) {
        applyEffectTextFields(out[found], te);
      } else {
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

  /** Merge seguro para arrays de embedded documents (items, features, etc.) */
  function safeMergeEmbedded(sourceEmbedded = [], translationEmbedded = {}) {
    const out = Array.isArray(sourceEmbedded)
      ? clone(sourceEmbedded)
      : (sourceEmbedded ? clone(Object.values(sourceEmbedded)) : []);
    if (!translationEmbedded) return out;

    const translations = Array.isArray(translationEmbedded)
      ? translationEmbedded
      : Object.entries(translationEmbedded).map(([k, v]) => ({ _key: k, ...v }));

    const idx = new Map();
    out.forEach((e, i) => {
      const keys = [e.name, e._id, e.id].filter(Boolean).map(lc);
      keys.forEach(k => idx.set(k, i));
    });

    translations.forEach(te => {
      const keys = [te._key, te.name, te.id].filter(Boolean).map(lc);
      let found = null;
      for (const k of keys) if (idx.has(k)) { found = idx.get(k); break; }

      if (found !== null) {
        const target = out[found];
        if (te.name) target.name = te.name;
        if (te.system && te.system.description && typeof te.system.description.value === "string") {
          target.system = target.system || {};
          target.system.description = target.system.description || {};
          target.system.description.value = te.system.description.value;
        }
      } else {
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

  /** Merge para actividades */
  function safeMergeActivities(sourceActivities = {}, translationActivities = {}) {
    if (!translationActivities) return sourceActivities;
    const out = clone(sourceActivities || {});
    for (const [k, v] of Object.entries(translationActivities)) {
      if (!out[k]) out[k] = v;
      else if (v.name) out[k].name = v.name;
    }
    return out;
  }

  /**
   * Fusiona las traducciones de los "advancements" (progresiones de clase).
   */
  function safeMergeAdvancements(target, translated) {
    const tAdv = foundry.utils.getProperty(translated, "system.advancement") || translated.advancement;
    const oAdv = foundry.utils.getProperty(target, "system.advancement") || target.advancement;

    if (!Array.isArray(oAdv) || !tAdv) return;

    for (let adv of oAdv) {
      const match = Object.entries(tAdv).find(([key]) => key === adv.title);
      if (!match) continue;

      const [key, value] = match;
      if (value.name && adv.title !== value.name) adv.title = value.name;
      if (value.description) adv.hint = value.description;

      foundry.utils.setProperty(adv, "flags.babele.name", value.name || adv.title);
      foundry.utils.setProperty(adv, "flags.babele.description", value.description || adv.hint);
    }
  }

  /** Converter general para entidades */
  function safeMergeEntity(source, translation) {
    if (!translation) return source;
    const out = clone(source);

    for (const [k, v] of Object.entries(translation)) {
      if (v === null || v === undefined) continue;

      if (k === "effects") { out.effects = safeMergeEffects(source.effects, v); continue; }
      if (k === "items" || k === "features" || k === "embeddedItems") {
        out.items = safeMergeEmbedded(source.items || source.embeddedItems || [], v);
        continue;
      }
      if (k === "activities" || k === "system.activities") {
        out.activities = safeMergeActivities(source.activities || {}, v);
        if (out.system) out.system.activities = safeMergeActivities((source.system?.activities) || {}, v);
        continue;
      }
      if (k === "advancement" || k === "system.advancement") {
        out.advancement = safeMergeAdvancements(source.advancement || [], v);
        if (out.system) out.system.advancement = safeMergeAdvancements((source.system?.advancement) || [], v);
        continue;
      }
      if (k === "flags") { out.flags = safeMergeFlags(source.flags || {}, v); continue; }

      out[k] = v;
    }

    // === Llamadas explícitas a merges seguros (garantiza que se apliquen aunque no estén en el JSON) ===
    if (source.effects?.length || translation.effects) {
      out.effects = safeMergeEffects(source.effects, translation.effects);
    }

    if ((source.system?.advancement?.length || translation.system?.advancement)) {
      safeMergeAdvancements(out, translation);
    }

    if ((source.system?.activities && Object.keys(source.system.activities).length) || translation.system?.activities) {
      out.system.activities = safeMergeActivities(source.system?.activities || {}, translation.system?.activities || {});
    }

    return out;
  }

  /** Registro de converters */
  try {
    game.babele.registerConverters({
      safeMergeEntity,
      safeMergeEffects,
      safeMergeEmbedded,
      safeMergeActivities,
      safeMergeFlags,
      safeMergeAdvancements
    });
    console.log("✅ Babele converters 'safeMerge*' registrados correctamente.");
  } catch (err) {
    console.error("❌ Error registrando converters en Babele:", err);
  }
});
