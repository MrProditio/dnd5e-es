import { Converters } from "../babele/scripts/converters.js";

Hooks.once('init', () => {
  if (typeof Babele !== 'undefined') {

    console.log('***********************');
    console.log('*** Babele DnD5e ES ***');
    console.log('***********************');

    // Registro de módulo y carpeta de traducciones
    Babele.get().register({
      module: 'dnd5e-es',
      lang: 'es',
      dir: 'compendium'
    });

    // Converter existente
    Babele.get().registerConverters({
      'dnd5ePages': (pages, translations) => {
        pages = Converters._pages(pages, translations);

        return pages.map(data => {
          if (!translations) return data;

          const translation = translations[data._id] || translations[data.name];
          if (!translation) return data;

          return foundry.utils.mergeObject(data, {
            system: {
              tooltip: translation.tooltip ?? data.system.tooltip
            }
          });
        });
      },

      // NUEVO converter para merge seguro de items/efectos/actividades
      'safeMergeEntity': Converters.safeMergeEntity
    });
  }
});