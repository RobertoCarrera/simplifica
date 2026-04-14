/**
 * Stub para ng-apexcharts - fue removido por incompatibilidad con Angular 21
 * Este archivo exporta los tipos y módulo necesarios para mantener compatibilidad
 * con el código existente en dashboard-analytics.component.ts
 *
 * TODO: Implementar charts nativos con Angular o usar alternativa como ngx-charts
 */
import { NgModule, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

// Tipos exportados para compatibilidad
export type ApexAxisChartSeries = {
  name?: string;
  data: number[] | { x: number; y: number }[];
}[];

export type ApexChart = {
  type?:
    | "line"
    | "bar"
    | "area"
    | "histogram"
    | "pie"
    | "donut"
    | "radialBar"
    | "scatter"
    | "bubble"
    | "heatmap"
    | "radar"
    | "rangeBar";
  height?: number | string;
  width?: number | string;
  animations?: { enabled?: boolean; easing?: string; speed?: number };
  background?: string;
  foreColor?: string;
  group?: string;
  id?: string;
  locales?: {
    name: string;
    options: {
      name: string;
      months: string[];
      shortMonths: string[];
      days: string[];
      shortDays: string[];
    }[];
  };
  offsetX?: number;
  offsetY?: number;
  parent?: string;
  sparkline?: { enabled?: boolean };
  stacked?: boolean;
  stackType?: "normal" | "100%";
  toolbar?: {
    show?: boolean;
    tools?: {
      download?: boolean;
      selection?: boolean;
      zoom?: boolean;
      pan?: boolean;
      reset?: boolean;
    };
  };
  zoom?: { enabled?: boolean };
};

export type ApexXAxis = {
  type?: "category" | "datetime" | "numeric";
  categories?: string[];
  labels?: { style?: { colors?: string; fontSize?: string } };
  axisBorder?: { show?: boolean; color?: string };
  axisTicks?: { show?: boolean; color?: string };
  tickAmount?: number;
  min?: number;
  max?: number;
};

export type ApexYAxis = {
  min?: number;
  max?: number;
  tickAmount?: number;
  labels?: {
    style?: { colors?: string };
    formatter?: (val: number) => string | number;
  };
};

export type ApexDataLabels = {
  enabled?: boolean;
  enabledOnSeries?: number[];
  formatter?: (
    val: number,
    opts?: { w: { globals: { seriesNames: string[]; series: number[][] } } },
  ) => string | number;
};

export type ApexTooltip = {
  enabled?: boolean;
  theme?: "light" | "dark";
  x?: { show?: boolean };
  y?: { formatter?: (val: number) => string | number };
};

export type ApexStroke = {
  curve?: "smooth" | "straight" | "stepline" | "flat";
  width?: number | number[];
  lineCap?: "butt" | "square";
};

export type ApexLegend = {
  show?: boolean;
  position?: "top" | "right" | "bottom" | "left";
  horizontalAlign?: "left" | "center" | "right";
  floating?: boolean;
};

export type ApexGrid = {
  show?: boolean;
  borderColor?: string;
  strokeDashArray?: number;
  xaxis?: { lines?: { show?: boolean } };
  yaxis?: { lines?: { show?: boolean } };
};

export type ApexPlotOptions = {
  bar?: {
    horizontal?: boolean;
    columnWidth?: string;
    borderRadius?: number;
    borderRadiusApplication?: "all" | "end";
  };
  area?: { inverse?: boolean };
};

export type ApexTheme = {
  mode?: "light" | "dark";
  palette?: string;
  fill?: { type?: "solid" | "gradient" };
};

// Componente placeholder (no renderiza nada)
@Component({
  selector: "apx-chart",
  standalone: true,
  imports: [CommonModule],
  template: `<div
    class="apexcharts-placeholder text-gray-400 text-sm p-4 text-center"
  >
    <span class="text-xs">📊 Chart unavailable (ng-apexcharts stub)</span>
  </div>`,
})
export class ApexChartComponent {
  @Input() type?: string;
  @Input() series?: ApexAxisChartSeries;
  @Input() options?: ApexChart;
}

// NgModule para compatibilidad
@NgModule({
  declarations: [],
  imports: [CommonModule, ApexChartComponent],
  exports: [ApexChartComponent],
})
export class NgApexchartsModule {}
