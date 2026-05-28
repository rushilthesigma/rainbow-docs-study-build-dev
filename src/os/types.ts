import type { ComponentType } from 'react';

export type AppId = string;

export interface IconProps {
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
}

export interface AppManifest {
  id: AppId;
  name: string;
  description: string;
  icon: ComponentType<IconProps & Record<string, unknown>>;
  defaultSize?: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  hideFromDock?: boolean;
  accent?: string;
}

export interface AppModule {
  manifest: AppManifest;
  Component: ComponentType<WindowAppProps>;
}

export interface WindowAppProps {
  windowId: string;
  appId: AppId;
}

export interface WindowState {
  id: string;
  appId: AppId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  prevBounds?: { x: number; y: number; width: number; height: number };
}
