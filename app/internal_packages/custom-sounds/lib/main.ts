import { SoundRegistry } from 'moros-exports';

export function activate() {
  SoundRegistry.register('send', 'moros://custom-sounds/CUSTOM_UI_Send_v1.ogg');
  SoundRegistry.register('confirm', 'moros://custom-sounds/CUSTOM_UI_Confirm_v1.ogg');
  SoundRegistry.register('hit-send', 'moros://custom-sounds/CUSTOM_UI_HitSend_v1.ogg');
  SoundRegistry.register('new-mail', 'moros://custom-sounds/CUSTOM_UI_NewMail_v1.ogg');
}

export function deactivate() {
  SoundRegistry.unregister(['send', 'confirm', 'hit-send', 'new-mail']);
}
