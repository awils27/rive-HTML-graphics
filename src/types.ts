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
  runtimeScriptUrl?: string;
  runtimeWasmUrl?: string;
  runtimeWasmFallbackUrl?: string | null;
  embed: boolean;
  base64?: string;
  rivPath?: string;
  stepCount: number;
  fallbackTimeline?: string | null;
  triggers?: CasparTriggers;
}

export interface OGrafNumberConstraint {
  max?: number;
  min?: number;
  exact?: number;
  ideal?: number;
}

export interface OGrafBooleanConstraint {
  exact?: boolean;
  ideal?: boolean;
}

export interface OGrafRenderRequirement {
  resolution?: {
    width?: OGrafNumberConstraint;
    height?: OGrafNumberConstraint;
  };
  frameRate?: OGrafNumberConstraint;
  accessToPublicInternet?: OGrafBooleanConstraint;
}

export interface OGrafFile {
  filename: string;
  blob: Blob;
}

export interface RiveContentsArtboard {
  name?: string;
  stateMachines?: Array<string | { name?: string }>;
  animations?: Array<string | { name?: string }>;
  animationNames?: Array<string | { name?: string }>;
  timelines?: Array<string | { name?: string }>;
}

export interface RiveContents {
  animations?: Array<string | { name?: string }>;
  artboards?: Array<string | RiveContentsArtboard>;
  data?: {
    animations?: Array<string | { name?: string }>;
    artboards?: Array<string | RiveContentsArtboard>;
  };
}
