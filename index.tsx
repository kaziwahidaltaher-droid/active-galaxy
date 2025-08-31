/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI} from '@google/genai';
import {LitElement, css, html, nothing} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import './visual-3d';

interface PlanetData {
  planetName: string;
  starSystem: string;
  distanceLightYears: number;
  planetType: string;
  discoveryNarrative: string;
  keyFeatures: string[];
  visualization: {
    color1: string;
    color2: string;
    atmosphereColor: string;
    hasRings: boolean;
  };
}

// FIX: Update GroundingChunk interface to match library, making properties optional
// to prevent type errors when assigning grounding metadata from the API response.
interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

@customElement('axee-interface')
export class AxeeInterface extends LitElement {
  @state() private isLoading = false;
  @state() private statusMessage = 'Awaiting Synthesis Command';
  @state() private planetData: PlanetData | null = null;
  @state() private error: string | null = null;
  @state() private userPrompt = '';
  @state() private groundingChunks: GroundingChunk[] = [];

  private ai: GoogleGenAI;

  constructor() {
    super();
    this.ai = new GoogleGenAI({apiKey: process.env.API_KEY});
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
      gap: 1.5rem;
    }

    input[type='text'] {
      pointer-events: all;
      font-family: 'Orbitron', sans-serif;
      background: rgba(0, 20, 34, 0.8);
      border: 1px solid #0af;
      color: #0af;
      padding: 0.8rem 1.5rem;
      font-size: 1rem;
      width: 500px;
      max-width: 90%;
      text-align: center;
      box-shadow: 0 0 10px #0af inset;
      transition: box-shadow 0.3s;
    }

    input[type='text']::placeholder {
      color: #0af;
      opacity: 0.5;
    }

    input[type='text']:focus {
      outline: none;
      box-shadow: 0 0 15px #0af inset, 0 0 10px #0af;
    }

    .status-bar {
      font-size: 1.2rem;
      letter-spacing: 0.1em;
      height: 2rem;
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
      transition: background 0.3s, color 0.3s, box-shadow 0.3s;
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

    .results-panel {
      position: absolute;
      top: 25%;
      left: 2rem;
      width: 350px;
      max-height: 60vh;
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

    .results-panel.visible {
      opacity: 1;
      transform: translateX(0);
    }

    .results-panel h2 {
      margin: 0 0 1rem 0;
      font-size: 1.8rem;
      text-transform: uppercase;
      border-bottom: 1px solid #0af;
      padding-bottom: 0.5rem;
    }

    .results-panel h3 {
      font-size: 1.2rem;
      text-transform: uppercase;
      margin-top: 1.5rem;
      border-top: 1px solid rgba(0, 170, 255, 0.3);
      padding-top: 1rem;
    }

    .results-panel p {
      margin: 0.5rem 0;
      line-height: 1.4;
    }

    .results-panel ul {
      list-style: none;
      padding: 0;
      margin: 0.5rem 0;
    }

    .results-panel li::before {
      content: '⏵';
      margin-right: 0.5rem;
      color: #0af;
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

  async synthesizeExoplanet() {
    this.isLoading = true;
    this.planetData = null;
    this.groundingChunks = [];
    this.error = null;
    this.statusMessage = 'Accessing NASA Exoplanet Archive...';

    try {
      const basePrompt = `You are AXEE (AURELION's Exoplanet Synthesis Engine). Your task is to generate a plausible, fictional exoplanet.
      1. Use your search tool to find real-world information about exoplanets, stars, and astronomical phenomena related to the user's request.
      2. Synthesize this information to create a NEW, UNIQUE, and FICTIONAL exoplanet. Do not simply describe a real exoplanet.
      3. Your entire response MUST be a single, valid JSON object that conforms to the structure below. Do not include any text, markdown, or explanations outside of the JSON object.

      JSON Structure:
      {
        "planetName": "string",
        "starSystem": "string",
        "distanceLightYears": number,
        "planetType": "string (e.g., 'Terrestrial Super-Earth', 'Gas Giant', 'Ice Giant')",
        "discoveryNarrative": "string (A short, engaging story of how this planet was 'discovered' by you, inspired by real discovery methods.)",
        "keyFeatures": ["string", "string", "..."],
        "visualization": {
          "color1": "string (Hex color code)",
          "color2": "string (Hex color code)",
          "atmosphereColor": "string (Hex color code)",
          "hasRings": boolean
        }
      }`;

      const userRequest =
        this.userPrompt.trim() !== ''
          ? `The user is looking for a planet with these characteristics: "${this.userPrompt}". Ground your synthesis in real data related to this request.`
          : `The user has not specified any characteristics, so generate any fascinating exoplanet you can imagine, grounded in real astronomical data.`;

      const prompt = `${basePrompt}\n\nUser Request: ${userRequest}`;

      // A little bit of UI theatre while we wait.
      setTimeout(() => {
        if (this.isLoading)
          this.statusMessage = 'Analyzing Kepler light curve data...';
      }, 2000);
      setTimeout(() => {
        if (this.isLoading)
          this.statusMessage = 'Calibrating discovery algorithms...';
      }, 4000);

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      // Store grounding metadata
      this.groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      const jsonString = response.text.trim();
      const data = JSON.parse(jsonString);

      this.planetData = data as PlanetData;
      this.statusMessage = `Synthesis Complete: ${this.planetData.planetName}`;
    } catch (e) {
      const errorMessage =
        e instanceof SyntaxError
          ? 'Failed to parse AI response.'
          : e.message;
      this.error = `Synthesis Failed: ${errorMessage}`;
      this.statusMessage = 'Synthesis Failed. Check console for details.';
      console.error(e);
    } finally {
      this.isLoading = false;
    }
  }

  renderResults() {
    if (!this.planetData) return nothing;
    return html`
      <div class="results-panel ${this.planetData ? 'visible' : ''}">
        <h2>${this.planetData.planetName}</h2>
        <p><strong>System:</strong> ${this.planetData.starSystem}</p>
        <p><strong>Type:</strong> ${this.planetData.planetType}</p>
        <p>
          <strong>Distance:</strong> ${this.planetData.distanceLightYears}
          light-years
        </p>
        <p><em>${this.planetData.discoveryNarrative}</em></p>
        <h3>Key Features:</h3>
        <ul>
          ${this.planetData.keyFeatures.map(
            (feature) => html`<li>${feature}</li>`,
          )}
        </ul>
        ${this.groundingChunks.length > 0
          ? html`
              <h3>Data Sources</h3>
              <div class="grounding-sources">
                ${// FIX: Safely render grounding chunks by checking for optional properties
                // to prevent broken links and potential runtime errors.
                this.groundingChunks.map(
                  (chunk) => {
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
                  },
                )}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  render() {
    return html`
      <axee-visuals-3d
        .planetData=${this.planetData}
        .isScanning=${this.isLoading}></axee-visuals-3d>
      <div class="overlay">
        <header>
          <h1>AXEE</h1>
          <p class="subtitle">AURELION Exoplanet Synthesis Engine</p>
        </header>

        ${this.renderResults()}

        <footer>
          <input
            type="text"
            placeholder="Describe the world you seek (e.g., 'a water world with two suns')"
            .value=${this.userPrompt}
            @input=${(e: Event) => {
              this.userPrompt = (e.target as HTMLInputElement).value;
            }}
            ?disabled=${this.isLoading}
            aria-label="Exoplanet description" />
          <button
            @click=${this.synthesizeExoplanet}
            ?disabled=${this.isLoading}>
            ${this.isLoading ? 'Synthesizing...' : 'Initiate Synthesis'}
          </button>
          <div class="status-bar">${this.error || this.statusMessage}</div>
        </footer>
      </div>
    `;
  }
}
