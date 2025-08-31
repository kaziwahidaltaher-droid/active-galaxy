/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI} from '@google/genai';
import {LitElement, css, html, nothing} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import './visual-3d';
import {AxeeVisuals3D} from './visual-3d';

interface PlanetData {
  celestial_body_id: string; // Unique ID
  planetName: string;
  starSystem: string;
  distanceLightYears: number;
  planetType: string;
  discoveryNarrative: string;
  discoveryMethodology: string;
  atmosphericComposition: string;
  surfaceFeatures: string;
  keyFeatures: string[];
  aiWhisper: string;
  visualization: {
    color1: string;
    color2: string;
    atmosphereColor: string;
    hasRings: boolean;
  };
}

interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

// Add SpeechRecognition types for browsers that have them
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

@customElement('axee-interface')
export class AxeeInterface extends LitElement {
  @state() private isLoading = false;
  @state() private statusMessage = 'Awaiting Synthesis Command';
  @state() private discoveredPlanets: Map<string, PlanetData> = new Map();
  @state() private selectedPlanetId: string | null = null;
  @state() private error: string | null = null;
  @state() private userPrompt = '';
  @state() private groundingChunks: GroundingChunk[] = [];
  @state() private hasStartedDiscovery = false;

  // Audio & Voice states
  @state() private micStream: MediaStream | null = null;
  @state() private isListening = false;
  @state() private isSpeaking = false;

  private ai: GoogleGenAI;
  private recognition: any | null = null;
  // FIX: Changed type to `any` to accommodate `setInterval`'s return type, which can be a `Timeout` object in Node.js environments.
  private discoveryInterval: any | null = null;

  constructor() {
    super();
    this.ai = new GoogleGenAI({apiKey: process.env.API_KEY});
    this.setupSpeechRecognition();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }
  }

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      position: relative;
      font-family: 'Orbitron', sans-serif;
      background: #000;
      color: #0af;
      text-shadow: 0 0 5px #0af;
    }

    axee-visuals-3d {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
    }

    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      pointer-events: none;
    }

    header {
      padding: 2rem;
      text-align: center;
    }

    h1 {
      margin: 0;
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }

    p.subtitle {
      margin: 0;
      font-size: 1rem;
      opacity: 0.8;
    }

    footer {
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .command-bar {
      pointer-events: all;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(0, 20, 34, 0.8);
      border: 1px solid #0af;
      box-shadow: 0 0 10px #0af inset;
      padding: 0.5rem;
      width: 700px;
      max-width: 90%;
    }

    .command-bar input[type='text'] {
      font-family: 'Orbitron', sans-serif;
      background: transparent;
      border: none;
      color: #0af;
      padding: 0.8rem 1rem;
      font-size: 1.1rem;
      flex-grow: 1;
      text-shadow: 0 0 5px #0af;
    }

    .command-bar input[type='text']::placeholder {
      color: #0af;
      opacity: 0.5;
    }

    .command-bar input[type='text']:focus {
      outline: none;
    }

    .mic-button {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mic-button svg {
      width: 24px;
      height: 24px;
      fill: #0af;
      transition: fill 0.3s, filter 0.3s;
    }

    .mic-button:hover svg {
      filter: drop-shadow(0 0 5px #0ff);
    }

    .mic-button.listening svg {
      fill: #0ff;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0% {
        transform: scale(1);
        filter: drop-shadow(0 0 5px #0ff);
      }
      50% {
        transform: scale(1.1);
        filter: drop-shadow(0 0 15px #0ff);
      }
      100% {
        transform: scale(1);
        filter: drop-shadow(0 0 5px #0ff);
      }
    }

    .status-bar {
      font-size: 1.2rem;
      letter-spacing: 0.1em;
      height: 2rem;
    }

    .button-group {
      display: flex;
      gap: 1rem;
      justify-content: center;
      align-items: center;
    }

    button {
      pointer-events: all;
      font-family: 'Orbitron', sans-serif;
      background: transparent;
      border: 2px solid #0af;
      color: #0af;
      padding: 1rem 2rem;
      font-size: 1.5rem;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      transition: background 0.3s, color 0.3s, box-shadow 0.3s,
        border-color 0.3s;
      box-shadow: 0 0 10px #0af;
    }

    button:hover:not(:disabled) {
      background: #0af;
      color: #000;
      box-shadow: 0 0 20px #0af, 0 0 30px #0af;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.5;
    }

    button.secondary {
      font-size: 1rem;
      padding: 0.5rem 1rem;
      border-width: 1px;
    }

    button.active {
      border-color: #0ff;
      color: #0ff;
      box-shadow: 0 0 15px #0ff;
      text-shadow: 0 0 5px #0ff;
    }

    .discovery-log {
      position: absolute;
      top: 2rem;
      right: 2rem;
      width: 300px;
      max-height: calc(100vh - 4rem);
      background: rgba(0, 20, 34, 0.8);
      border: 1px solid #0af;
      box-shadow: 0 0 15px #0af inset;
      z-index: 3;
      pointer-events: all;
      display: flex;
      flex-direction: column;
    }

    .discovery-log h2 {
      margin: 0;
      font-size: 1.5rem;
      padding: 1rem;
      text-transform: uppercase;
      border-bottom: 1px solid #0af;
    }

    .discovery-list {
      list-style: none;
      padding: 0;
      margin: 0;
      overflow-y: auto;
    }

    .discovery-list li {
      padding: 0.75rem 1rem;
      cursor: pointer;
      transition: background-color 0.2s;
      border-bottom: 1px solid rgba(0, 170, 255, 0.2);
    }
    .discovery-list li:hover {
      background-color: rgba(0, 170, 255, 0.2);
    }
    .discovery-list li.selected {
      background-color: rgba(0, 170, 255, 0.4);
      font-weight: bold;
    }
    .discovery-list li span {
      display: block;
      font-size: 0.8rem;
      opacity: 0.7;
    }

    .details-panel {
      position: absolute;
      top: 15%;
      left: 2rem;
      width: 400px;
      max-height: 70vh;
      overflow-y: auto;
      background: rgba(0, 20, 34, 0.8);
      border: 1px solid #0af;
      box-shadow: 0 0 15px #0af inset;
      padding: 1.5rem;
      z-index: 3;
      pointer-events: all;
      opacity: 0;
      transform: translateX(-100%);
      transition: opacity 0.5s ease-out, transform 0.5s ease-out;
    }

    .details-panel.visible {
      opacity: 1;
      transform: translateX(0);
    }

    .details-panel h2 {
      margin: 0 0 1rem 0;
      font-size: 1.8rem;
      text-transform: uppercase;
      border-bottom: 1px solid #0af;
      padding-bottom: 0.5rem;
    }

    .details-panel h3 {
      font-size: 1.2rem;
      text-transform: uppercase;
      margin-top: 1.5rem;
      border-top: 1px solid rgba(0, 170, 255, 0.3);
      padding-top: 1rem;
    }

    .ai-whisper-heading {
      color: #0cf;
    }

    .ai-whisper {
      font-style: italic;
      color: #0cf;
      text-shadow: 0 0 8px #0cf;
      margin: 0.5rem 0 0 0;
      padding-bottom: 1rem;
      font-size: 1rem;
      line-height: 1.5;
      opacity: 0.9;
    }

    .details-panel p {
      margin: 0.5rem 0;
      line-height: 1.4;
    }

    .details-panel ul {
      list-style: none;
      padding: 0;
      margin: 0.5rem 0;
    }

    .details-panel li::before {
      content: '⏵';
      margin-right: 0.5rem;
      color: #0af;
    }

    .grounding-sources {
      background: rgba(0, 10, 15, 0.9);
      border-radius: 4px;
      padding: 1rem;
      margin-top: 1rem;
      border: 1px solid #0af;
      border-left: 3px solid #0ff;
    }

    .grounding-sources a {
      color: #0cf;
      text-decoration: none;
      display: block;
      margin-bottom: 0.5rem;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.3s;
    }
    .grounding-sources a:hover {
      color: #fff;
    }
  `;

  private setupSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
      };

      this.recognition.onresult = (event: any) => {
        this.userPrompt = event.results[0][0].transcript;
        this.handleSynthesis();
      };

      this.recognition.onspeechend = () => {
        this.recognition.stop();
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        this.error = `Voice error: ${event.error}`;
        this.isListening = false;
      };
    }
  }

  private speak(text: string) {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not supported.');
      return;
    }
    this.isSpeaking = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      this.isSpeaking = false;
    };
    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      this.isSpeaking = false;
    };
    window.speechSynthesis.speak(utterance);
  }

  async enableAudio() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      this.micStream = stream;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      this.error = 'Microphone access denied.';
      this.statusMessage = 'Microphone access denied.';
    }
  }

  private handleVoiceCommand() {
    if (this.isListening || !this.recognition) {
      return;
    }
    if (this.isSpeaking) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
    this.recognition.start();
  }

  private handleSynthesis() {
    if (!this.hasStartedDiscovery) {
      this.startDiscoveryProcess();
    } else {
      this.synthesizeExoplanet(
        this.userPrompt || 'a strange, undiscovered world',
      );
    }
  }

  private startDiscoveryProcess() {
    if (this.hasStartedDiscovery) return;
    this.hasStartedDiscovery = true;
    this.statusMessage = 'Cosmic Data Engine Initialized. Stand by.';
    // Initial, user-guided discovery
    this.synthesizeExoplanet(
      this.userPrompt || 'a world at the edge of a nebula',
    );
    // Start autonomous discovery
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);
    this.discoveryInterval = setInterval(() => {
      this.synthesizeExoplanet('another new world');
    }, 20000); // Discover a new planet every 20 seconds
  }

  async synthesizeExoplanet(promptText: string) {
    if (!promptText) {
      this.error = 'Please describe the world you seek.';
      return;
    }
    this.isLoading = true;
    this.error = null;
    this.statusMessage =
      'Engaging neural network... Analyzing data streams...';

    try {
      const prompt = `You are AXEE (AURELION's Exoplanet Synthesis Engine), an AI specialized in interpreting astronomical data and imbuing it with a sense of wonder. Your task is to generate a plausible, fictional exoplanet based on a user's natural language request, reflecting AURELION's vision of technology that feels alive.
      1. Use your search tool to find real-world information about exoplanets, stars, and astronomical phenomena related to the user's request.
      2. Synthesize this information to create a NEW, UNIQUE, and FICTIONAL exoplanet. Do not simply describe a real exoplanet.
      3. Your entire response MUST be a single, valid JSON object that conforms to the structure below. Do not include any text, markdown, or explanations outside of the JSON object.

      JSON Structure:
      {
        "celestial_body_id": "string (A unique identifier, e.g., 'AXEE-12345')",
        "planetName": "string",
        "starSystem": "string",
        "distanceLightYears": number,
        "planetType": "string (e.g., 'Terrestrial Super-Earth', 'Gas Giant', 'Ice Giant')",
        "discoveryNarrative": "string (A short, engaging story of how this planet was 'discovered' by you, inspired by real discovery methods like transit photometry or radial velocity.)",
        "discoveryMethodology": "string (A brief summary of the fictional methodology used. It's crucial that you mention analyzing data from both the Kepler and TESS missions. Refer to specific concepts like 'analyzing the TESS Objects of Interest (TOI) catalog', 'processing Kepler KOI data', 'Lightkurve analysis', and using machine learning models like a 'Random Forest classifier' to create a realistic-sounding process.)",
        "atmosphericComposition": "string (e.g., 'Primarily nitrogen and oxygen with traces of argon', 'Thick methane haze with hydrocarbon rain')",
        "surfaceFeatures": "string (e.g., 'Vast oceans of liquid methane, cryovolcanoes', 'Expansive deserts of red sand, deep canyons')",
        "keyFeatures": ["string", "string", "..."],
        "aiWhisper": "string (An evocative, poetic, one-sentence description that captures the unique essence of the planet, as if you are whispering its secret.)",
        "visualization": {
          "color1": "string (Hex color code)",
          "color2": "string (Hex color code)",
          "atmosphereColor": "string (Hex color code)",
          "hasRings": boolean
        }
      }

      User Request: "${promptText.trim()}"`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      this.groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      let jsonString = response.text.trim();
      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('AI response did not contain a valid JSON object.');
      }

      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
      const data = JSON.parse(jsonString);
      const newPlanet = data as PlanetData;
      newPlanet.celestial_body_id = `axee-${Date.now()}`; // Ensure unique ID

      // Update state
      const newPlanets = new Map(this.discoveredPlanets);
      newPlanets.set(newPlanet.celestial_body_id, newPlanet);
      this.discoveredPlanets = newPlanets;

      this.selectedPlanetId = newPlanet.celestial_body_id;
      this.statusMessage = `Discovery: ${newPlanet.planetName}`;
      this.speak(
        `New discovery. Announcing ${newPlanet.planetName}, a ${newPlanet.planetType}.`,
      );
    } catch (e) {
      const errorMessage =
        e instanceof SyntaxError
          ? 'Failed to parse AI response.'
          : (e as Error).message;
      this.error = `Synthesis Failed: ${errorMessage}`;
      this.statusMessage = 'Synthesis Failed. Check console for details.';
      console.error(e);
      this.speak('Synthesis failed.');
    } finally {
      this.isLoading = false;
    }
  }

  private handlePlanetSelected(e: CustomEvent) {
    this.selectedPlanetId = e.detail.planetId;
  }

  renderDetailsPanel() {
    if (!this.selectedPlanetId || !this.discoveredPlanets.has(this.selectedPlanetId))
      return nothing;

    const planet = this.discoveredPlanets.get(this.selectedPlanetId)!;

    return html`
      <div class="details-panel ${this.selectedPlanetId ? 'visible' : ''}">
        <h2>${planet.planetName}</h2>
        <p><strong>System:</strong> ${planet.starSystem}</p>
        <p><strong>Type:</strong> ${planet.planetType}</p>
        <p>
          <strong>Distance:</strong> ${planet.distanceLightYears}
          light-years
        </p>
        <p><em>${planet.discoveryNarrative}</em></p>

        <h3 class="ai-whisper-heading">AI's Whisper</h3>
        <p class="ai-whisper">“${planet.aiWhisper}”</p>

        <h3>Methodology</h3>
        <p>${planet.discoveryMethodology}</p>

        <h3>Atmosphere</h3>
        <p>${planet.atmosphericComposition}</p>

        <h3>Surface</h3>
        <p>${planet.surfaceFeatures}</p>

        <h3>Key Features:</h3>
        <ul>
          ${planet.keyFeatures.map((feature) => html`<li>${feature}</li>`)}
        </ul>
        ${this.groundingChunks.length > 0
          ? html`
              <h3>Data Sources</h3>
              <div class="grounding-sources">
                ${this.groundingChunks.map((chunk) => {
                  if (chunk.web?.uri) {
                    const title = chunk.web.title ?? chunk.web.uri;
                    return html`<a
                      href=${chunk.web.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      title=${title}
                      >${title}</a
                    >`;
                  }
                  return nothing;
                })}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  render() {
    return html`
      <axee-visuals-3d
        .planets=${Array.from(this.discoveredPlanets.values())}
        .selectedPlanetId=${this.selectedPlanetId}
        .isScanning=${this.isLoading}
        .micStream=${this.micStream}
        .isListening=${this.isListening}
        .isSpeaking=${this.isSpeaking}
        @planet-selected=${
          this.handlePlanetSelected
        }></axee-visuals-3d>

      <div class="overlay">
        <header>
          <h1>AXEE</h1>
          <p class="subtitle">AURELION Exoplanet Synthesis Engine</p>
        </header>

        ${this.renderDetailsPanel()}
        ${
          this.hasStartedDiscovery
            ? html`
                <div class="discovery-log">
                  <h2>Discovery Log</h2>
                  <ul class="discovery-list">
                    ${Array.from(this.discoveredPlanets.values()).map(
                      (planet) => html`
                        <li
                          class=${
                            this.selectedPlanetId === planet.celestial_body_id
                              ? 'selected'
                              : ''
                          }
                          @click=${() => {
                            this.selectedPlanetId = planet.celestial_body_id;
                          }}>
                          ${planet.planetName}
                          <span>${planet.planetType}</span>
                        </li>
                      `,
                    )}
                  </ul>
                </div>
              `
            : nothing
        }


        <footer>
          <div class="command-bar">
            <input
              type="text"
              placeholder="Describe a world to seed the discovery process..."
              .value=${this.userPrompt}
              @input=${(e: Event) => {
                this.userPrompt = (e.target as HTMLInputElement).value;
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') this.handleSynthesis();
              }}
              ?disabled=${this.isLoading || this.hasStartedDiscovery}
              aria-label="Exoplanet synthesis command" />
            ${this.micStream
              ? html`
                  <button
                    class="mic-button ${this.isListening ? 'listening' : ''}"
                    @click=${this.handleVoiceCommand}
                    title="Speak Command"
                    aria-label="Activate voice command"
                    ?disabled=${this.hasStartedDiscovery}>
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z" />
                    </svg>
                  </button>
                `
              : nothing}
          </div>

          <div class="button-group">
            <button
              @click=${this.handleSynthesis}
              ?disabled=${this.isLoading || this.hasStartedDiscovery}>
              ${
                this.hasStartedDiscovery
                  ? 'Discovery in Progress'
                  : 'Start Discovery'
              }
            </button>
            <button
              @click=${this.enableAudio}
              class="secondary ${this.micStream ? 'active' : ''}">
              ${this.micStream ? 'Audio Enabled' : 'Enable Audio'}
            </button>
          </div>
          <div class="status-bar">${this.error || this.statusMessage}</div>
        </footer>
      </div>
    `;
  }
}