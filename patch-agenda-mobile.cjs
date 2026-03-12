const fs = require('fs');
let content = fs.readFileSync('src/app/features/agenda/agenda.component.html', 'utf8');

// We want to transform the aside structure and inject a mobile toolbar.
// We'll wrap the inner content of the aside inside an <ng-template #sideContent>

const asideStart = `  <!-- Left Side: Sidebar Filters -->
  <aside class="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-800 overflow-y-auto">`;

const asideContentEndContext = `    </div>
  </aside>`;

const mainStart = `  <!-- Main Content -->
  <main class="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-gray-800">
    <div #agendaMainScroll class="flex-1 relative overflow-auto custom-scrollbar overflow-y-scroll overflow-x-scroll">`;

// Find everything inside and outside

if(content.includes(asideStart)) {
    console.log("Found aside start");
}

let sideInner = content.substring(content.indexOf(asideStart) + asideStart.length, content.indexOf(asideContentEndContext) + `    </div>`.length);

// Modifications mapping on the side inner content
sideInner = sideInner.replace('<div class="px-4 py-4 border-b border-gray-200 dark:border-gray-700">', '<div class="px-4 py-4 border-b border-gray-200 dark:border-gray-700 hidden md:block">');
sideInner = sideInner.replace('<div class="px-4 py-4 border-b border-gray-200 dark:border-gray-700 space-y-3">', '<div class="px-4 py-4 border-b border-gray-200 dark:border-gray-700 flex md:block flex-row md:flex-col gap-4 md:gap-0 space-y-0 md:space-y-3 overflow-x-auto md:overflow-visible">');
sideInner = sideInner.replaceAll('class="flex items-center text-indigo-600 font-medium hover:underline"', 'class="flex items-center text-indigo-600 font-medium hover:underline whitespace-nowrap"');
sideInner = sideInner.replace('<div class="p-4 space-y-4">', '<div class="p-4 space-y-4 pb-20 md:pb-4">');

const newTemplate = `
  <ng-template #sideContent>
${sideInner}
  </ng-template>

  <!-- Left Side: Sidebar Filters (Desktop) -->
  <aside class="hidden md:flex w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex-col bg-white dark:bg-gray-800 overflow-y-auto">
    <ng-container *ngTemplateOutlet="sideContent"></ng-container>
  </aside>
`;

content = content.replace(content.substring(content.indexOf(asideStart), content.indexOf(asideContentEndContext) + asideContentEndContext.length), newTemplate);


const newMainStart = `  <!-- Main Content -->
  <main class="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-gray-800 relative">
    
    <!-- Mobile Filters Toolbar -->
    <div class="md:hidden flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-[60] shadow-sm flex-shrink-0">
      <button (click)="mobileFiltersOpen.set(!mobileFiltersOpen())" class="flex items-center justify-center text-sm font-medium text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        <i class="fas fa-filter mr-2"></i> {{ mobileFiltersOpen() ? 'Ocultar Filtros' : 'Filtros' }}
      </button>
      <div class="text-[11px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis flex items-center">
        <span>{{ filteredProfessionals().length }} Prof. </span>
        @if (selectedProfessionalIds().size !== professionals().length || selectedServiceIds().size > 0 || selectedResourceIds().size > 0) {
          <span class="text-indigo-600 dark:text-indigo-400 ml-1"><i class="fas fa-filter"></i></span>
        }
      </div>
    </div>
    
    <!-- Mobile Filters Drawer -->
    @if (mobileFiltersOpen()) {
        <div class="md:hidden absolute top-[52px] left-0 right-0 bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-[55] overflow-y-auto custom-scrollbar border-b border-gray-200 dark:border-gray-700 flex flex-col">
           <ng-container *ngTemplateOutlet="sideContent"></ng-container>
        </div>
    }

    <div #agendaMainScroll class="flex-1 relative overflow-auto custom-scrollbar overflow-y-scroll overflow-x-scroll">`;

content = content.replace(mainStart, newMainStart);

fs.writeFileSync('src/app/features/agenda/agenda.component.html', content);
console.log("Successfully patched agenda component HTML!");
