/**
 * Alerta sonoro do painel (HTML5 <audio>).
 *
 * Navegadores bloqueiam áudio automático até o usuário interagir com a página
 * (autoplay policy). Por isso `unlock()` é chamado no primeiro clique/tecla do
 * administrador (ou no botão "Ativar alertas sonoros"). Depois disso o som toca
 * sozinho a cada novo pedido recebido via WebSocket.
 */
const SOUND_SRC = "/sounds/new-order.wav";

class AlertSound {
  constructor(src) {
    this.src = src;
    this.audio = typeof Audio !== "undefined" ? new Audio(src) : null;
    if (this.audio) {
      this.audio.preload = "auto";
      this.audio.volume = 1;
    }
    this.unlocked = false;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    this.listeners.forEach((fn) => fn(this.unlocked));
  }

  async unlock() {
    if (!this.audio || this.unlocked) return this.unlocked;
    try {
      this.audio.muted = true;
      await this.audio.play();
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.muted = false;
      this.unlocked = true;
    } catch {
      this.audio.muted = false;
      this.unlocked = false;
    }
    this._emit();
    return this.unlocked;
  }

  setVolume(v) {
    if (this.audio) this.audio.volume = Math.min(1, Math.max(0, v));
  }

  async play() {
    if (!this.audio) return false;
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
      await this.audio.play();
      if (!this.unlocked) {
        this.unlocked = true;
        this._emit();
      }
      return true;
    } catch (err) {
      // Bloqueado pelo navegador: o painel mostra o aviso para o admin clicar.
      this.unlocked = false;
      this._emit();
      console.warn("Alerta sonoro bloqueado pelo navegador:", err?.message);
      return false;
    }
  }
}

export const alertSound = new AlertSound(SOUND_SRC);

// Desbloqueia automaticamente na primeira interação do usuário com a página.
if (typeof window !== "undefined") {
  const unlockOnce = () => {
    alertSound.unlock();
    window.removeEventListener("pointerdown", unlockOnce);
    window.removeEventListener("keydown", unlockOnce);
  };
  window.addEventListener("pointerdown", unlockOnce);
  window.addEventListener("keydown", unlockOnce);
}
