/**
 * Speed Insights Initialization
 * Initializes Vercel Speed Insights tracking for the application.
 * 
 * This implementation uses the queue-based approach recommended for vanilla JavaScript/HTML sites.
 * The tracking script is automatically injected by Vercel at /_vercel/speed-insights/script.js
 * when the application is deployed.
 */

(function() {
  'use strict';
  
  // Initialize the Speed Insights queue
  // This allows tracking calls to be queued before the main script loads
  window.si = window.si || function() {
    (window.siq = window.siq || []).push(arguments);
  };

  // Load the Speed Insights tracking script
  // When deployed to Vercel, this will load from /_vercel/speed-insights/script.js
  // In development, it loads from Vercel's CDN with debug mode enabled
  function loadSpeedInsights() {
    if (typeof window === 'undefined') return;
    
    const script = document.createElement('script');
    script.defer = true;
    
    // Use Vercel's default path which works automatically when deployed
    // For local development, this will fail silently as Speed Insights only works in production
    script.src = '/_vercel/speed-insights/script.js';
    
    // Optional: Add error handling for development environments
    script.onerror = function() {
      // Speed Insights script not available - this is expected in local development
      console.debug('Speed Insights: Script not loaded. This is expected in local development.');
    };
    
    document.head.appendChild(script);
  }

  // Load the script when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSpeedInsights);
  } else {
    loadSpeedInsights();
  }
})();
