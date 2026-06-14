import ToolbarCategoryPicker from './toolbar-category-picker';
import { ComponentRegistry } from 'moros-exports';

export function activate() {
  ComponentRegistry.register(ToolbarCategoryPicker, { role: 'ThreadActionsToolbarButton' });
}

export function deactivate() {
  ComponentRegistry.unregister(ToolbarCategoryPicker);
}
