/**
 * geo-block.js — India-Only Access Restriction
 * Uses ipapi.co to detect country, blocks non-IN visitors.
 * Falls back silently if API fails (allows access on error).
 */
(function () {
    'use strict';

    const ALLOWED_COUNTRY = 'IN';
    const CACHE_KEY = 'getnow_geo_ok';
    const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

    // ── Check session cache first (avoids repeat API calls) ──
    try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            const { allowed, ts } = JSON.parse(cached);
            if (Date.now() - ts < CACHE_TTL) {
                if (!allowed) showBlock();
                return; // exit early — already decided
            }
        }
    } catch (_) { /* ignore */ }

    // ── Fetch IP country ──────────────────────────────────────
    fetch('https://ipapi.co/json/', { cache: 'default' })
        .then(r => r.json())
        .then(data => {
            const country = data.country_code || '';
            const allowed = country === ALLOWED_COUNTRY;
            try {
                sessionStorage.setItem(CACHE_KEY, JSON.stringify({ allowed, ts: Date.now() }));
            } catch (_) { /* ignore */ }
            if (!allowed) showBlock(country);
        })
        .catch(() => {
            // API failed — fail open (allow access) to avoid blocking real users
        });

    // ── Block Overlay ─────────────────────────────────────────
    function showBlock(countryCode) {
        // Pause all page activity
        document.body.style.overflow = 'hidden';

        const overlay = document.createElement('div');
        overlay.id = 'geo-block-overlay';
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('role', 'dialog');

        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #080c16;
            font-family: 'Poppins', 'Segoe UI', sans-serif;
        `;

        overlay.innerHTML = `
            <style>
                #geo-block-overlay * { box-sizing: border-box; margin: 0; padding: 0; }
                @keyframes geoFadeIn {
                    from { opacity: 0; transform: translateY(24px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes geoPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 77, 77, 0.4); }
                    70%       { box-shadow: 0 0 0 18px rgba(255, 77, 77, 0); }
                }
                #geo-block-card {
                    background: #111827;
                    border: 1px solid rgba(255, 77, 77, 0.25);
                    border-radius: 24px;
                    padding: 44px 36px;
                    max-width: 420px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 60px rgba(255,77,77,0.08);
                    animation: geoFadeIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards;
                }
                #geo-block-icon-wrap {
                    width: 76px;
                    height: 76px;
                    border-radius: 50%;
                    background: rgba(255, 77, 77, 0.1);
                    border: 2px solid rgba(255, 77, 77, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 24px;
                    animation: geoPulse 2.5s infinite;
                    font-size: 2rem;
                }
                #geo-block-title {
                    font-size: 1.5rem;
                    font-weight: 800;
                    color: #fff;
                    margin-bottom: 12px;
                    line-height: 1.25;
                }
                #geo-block-sub {
                    font-size: 0.88rem;
                    color: #8892a4;
                    line-height: 1.65;
                    margin-bottom: 28px;
                }
                #geo-block-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(255, 77, 77, 0.1);
                    border: 1px solid rgba(255, 77, 77, 0.3);
                    color: #ff6b6b;
                    padding: 8px 18px;
                    border-radius: 30px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                }
                #geo-block-flag {
                    font-size: 1.1rem;
                }
                #geo-block-divider {
                    height: 1px;
                    background: rgba(255,255,255,0.06);
                    margin: 24px 0;
                }
                #geo-block-footer {
                    font-size: 0.74rem;
                    color: #4a556a;
                    line-height: 1.5;
                }
                @media (max-width: 480px) {
                    #geo-block-card {
                        padding: 32px 20px;
                        border-radius: 18px;
                    }
                    #geo-block-title { font-size: 1.25rem; }
                }
            </style>

            <div id="geo-block-card">
                <div id="geo-block-icon-wrap">
                    <span>🚫</span>
                </div>
                <h1 id="geo-block-title">Access Restricted</h1>
                <p id="geo-block-sub">
                    This shop is currently <strong style="color:#fff;">available in India only.</strong>
                    Our services and transactions are exclusively for Indian users at this time.
                </p>
                <div id="geo-block-badge">
                    <span id="geo-block-flag">🇮🇳</span>
                    <span>India-Only Platform</span>
                </div>
                <div id="geo-block-divider"></div>
                <p id="geo-block-footer">
                    If you are in India and seeing this message, please disable any VPN or proxy and reload the page.
                </p>
            </div>
        `;

        // Inject into page
        if (document.body) {
            document.body.appendChild(overlay);
        } else {
            document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));
        }
    }
})();
