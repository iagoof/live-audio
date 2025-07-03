/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, Chat} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import './visual-3d';

// Adiciona os tipos para as APIs de reconhecimento de fala do navegador
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() isSpeaking = false;
  @state() isThinking = false;
  @state() status = 'Conectado. Clique para falar.';
  @state() error = '';

  private client: GoogleGenAI;
  private chat: Chat;
  private recognition: any; // Instância do SpeechRecognition

  private inputAudioContext = new ((window as any).AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  @state() inputNode = this.inputAudioContext.createGain();

  private mediaStream: MediaStream;
  private sourceNode: MediaStreamAudioSourceNode;

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      font-family: sans-serif;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      button.hidden {
        display: none;
      }
    }
  `;

  constructor() {
    super();
    this.initClient();
    this.initSpeechRecognition();
  }

  private async initClient() {
    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });
    this.initChat();
  }

  private initChat() {
    this.chat = this.client.chats.create({
      model: 'gemini-2.5-flash-preview-04-17',
      config: {
        systemInstruction: {
          parts: [
            {
              text: 'Você é um psicólogo brasileiro. Fale de maneira calma, empática e acolhedora. Use o português do Brasil. Suas respostas devem ser concisas.',
            },
          ],
        },
      },
    });
  }

  private initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.updateError('API de Reconhecimento de Fala não suportada neste navegador.');
      return;
    }
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'pt-BR';
    this.recognition.continuous = true;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.updateStatus('Ouvindo...');
    };

    this.recognition.onresult = async (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        this.stopRecording();
        await this.sendTextToGemini(finalTranscript.trim());
      }
    };

    this.recognition.onend = () => {
      this.isRecording = false;
      if (!this.isThinking && !this.isSpeaking) {
        this.updateStatus('Conectado. Clique para falar.');
      }
    };

    this.recognition.onerror = (event: any) => {
      this.updateError(`Erro no reconhecimento: ${event.error}`);
      this.isRecording = false;
    };
  }

  private async sendTextToGemini(text: string) {
    if (!text) return;
    try {
      this.isThinking = true;
      this.updateStatus('Pensando...');
      const response = await this.chat.sendMessage({message: text});
      this.isThinking = false;
      this.speakResponse(response.text);
    } catch (e) {
      this.isThinking = false;
      this.updateError(e.message);
      this.updateStatus('Erro. Tente novamente.');
    }
  }

  private speakResponse(text: string) {
    if (!text || !window.speechSynthesis) {
      this.updateStatus('Pronto.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.updateStatus('Falando...');
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.updateStatus('Conectado. Clique para falar.');
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      this.updateError(`Erro na fala: ${e.error}`);
      this.updateStatus('Erro. Tente novamente.');
    };

    window.speechSynthesis.speak(utterance);
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.error = '';

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.inputAudioContext.resume();
      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);
      this.recognition.start();
    } catch (err) {
      console.error('Erro ao iniciar a gravação:', err);
      this.updateError(`Erro no microfone: ${err.message}`);
    }
  }

  private stopRecording() {
    if (!this.isRecording) return;
    this.recognition.stop();
    this.isRecording = false;

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.updateStatus('Processando...');
  }

  private reset() {
    if(this.isRecording) this.stopRecording();
    if(this.isSpeaking) window.speechSynthesis.cancel();
    this.initChat();
    this.updateStatus('Sessão reiniciada.');
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
    console.error(msg);
  }

  render() {
    const isBusy = this.isThinking || this.isSpeaking;
    return html`
      <div>
        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording || isBusy}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            class=${this.isRecording ? 'hidden' : ''}
            @click=${this.startRecording}
            ?disabled=${isBusy}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            class=${!this.isRecording ? 'hidden' : ''}
            @click=${this.stopRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        </div>

        <div id="status"> ${this.error ? this.error : this.status} </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .isSpeaking=${this.isSpeaking}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
