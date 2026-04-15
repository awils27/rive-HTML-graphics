export type Runtime = "canvas" | "webgl";

export type ViewModelPropType =
  | "string"
  | "number"
  | "boolean"
  | "color"
  | "trigger"
  | "image";

export type ViewModelValue = string | number | boolean | null;

export interface ViewModelProp {
  name: string;
  type: ViewModelPropType;
  value: ViewModelValue;
}

export interface RiveSchema {
  artboard: string;
  stateMachine: string;
  viewModelProps: ViewModelProp[];
}

export interface CasparTriggers {
  in?: string | null;
  out?: string | null;
  next?: string | null;
}

export interface TemplateOptions {
  runtime: Runtime;
  embed: boolean;
  base64?: string;
  rivPath?: string;
  casparTriggers?: CasparTriggers;
  vmDefaults?: Record<string, string | number | boolean>;
}

export interface PresetXmlOptions {
  layer?: number;
  sendAsJson?: boolean;
  label?: string;
}

export interface OGrafAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface OGrafOptions {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: OGrafAuthor;
  mainFilename: string;
  runtime: Runtime;
  embed: boolean;
  base64?: string;
  rivPath?: string;
  stepCount: number;
  triggers?: CasparTriggers;
}

export interface OGrafFile {
  filename: string;
  blob: Blob;
}

export interface RiveContentsArtboard {
  name?: string;
  stateMachines?: Array<string | { name?: string }>;
}

export interface RiveContents {
  artboards?: Array<string | RiveContentsArtboard>;
  data?: {
    artboards?: Array<string | RiveContentsArtboard>;
  };
}
