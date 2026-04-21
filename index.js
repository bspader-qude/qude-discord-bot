// Qude Alexa Skill
// Deploy as AWS Lambda (Node.js 18.x runtime)
// Required env vars: QUDE_API_URL
//
// Intents handled:
//   AddShowIntent        — "Alexa, add Breaking Bad to my Qude watchlist"
//   GetWatchlistIntent   — "Alexa, what's on my Qude watchlist"
//   GetRecommendIntent   — "Alexa, ask Qude what I should watch tonight"
//   MarkWatchedIntent    — "Alexa, tell Qude I finished Succession"
//   TrendingIntent       — "Alexa, ask Qude what's trending"
//   HelpIntent, StopIntent, CancelIntent (built-in)

const Alexa = require('ask-sdk-core');
const https = require('https');

const QUDE_API = process.env.QUDE_API_URL || 'https://qude-production.up.railway.app/api';

// ── HTTP helper ───────────────────────────────────────────────────────────────

function apiGet(path) {
  return new Promise((resolve, reject) => {
    https.get(`${QUDE_API}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Parse error')); }
      });
    }).on('error', reject);
  });
}

// ── Session token helper ──────────────────────────────────────────────────────
// Users say "ask Qude to link account [token]" once to store their auth token
// in session attributes. For a real skill, use Alexa Account Linking.

function getToken(handlerInput) {
  const sessionAttrs = handlerInput.attributesManager.getSessionAttributes();
  return sessionAttrs.qudeToken || null;
}

// ── Launch ────────────────────────────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle: (input) => Alexa.getRequestType(input.requestEnvelope) === 'LaunchRequest',
  handle: (input) => {
    const speech = "Welcome to Qude! You can say: what's on my watchlist, add a show, what should I watch tonight, or what's trending. What would you like to do?";
    return input.responseBuilder
      .speak(speech)
      .reprompt("What would you like to do?")
      .getResponse();
  },
};

// ── Get Watchlist ─────────────────────────────────────────────────────────────

const GetWatchlistIntentHandler = {
  canHandle: (input) =>
    Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
    Alexa.getIntentName(input.requestEnvelope) === 'GetWatchlistIntent',
  handle: async (input) => {
    try {
      const data = await apiGet('/detection/popular-now');
      const popular = data.popular || [];

      if (popular.length === 0) {
        return input.responseBuilder
          .speak("I couldn't find any trending shows right now. Try visiting qudetv.com to see your watchlist.")
          .getResponse();
      }

      const topShows = popular.slice(0, 3).map(s => s.title).join(', ');
      const speech = `Here's what's popular on Qude right now: ${topShows}. Visit qudetv.com to see your personal watchlist.`;

      return input.responseBuilder.speak(speech).getResponse();
    } catch {
      return input.responseBuilder
        .speak("I had trouble connecting to Qude. Please try again in a moment.")
        .getResponse();
    }
  },
};

// ── Get Recommendation ────────────────────────────────────────────────────────

const GetRecommendIntentHandler = {
  canHandle: (input) =>
    Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
    Alexa.getIntentName(input.requestEnvelope) === 'GetRecommendIntent',
  handle: async (input) => {
    try {
      const data = await apiGet('/tmdb/trending');
      const shows = data.results || [];

      if (shows.length === 0) {
        return input.responseBuilder
          .speak("Visit qudetv.com and tap 'Pick tonight's show' for a personalised recommendation!")
          .getResponse();
      }

      // Pick a random one from top 5
      const pick = shows[Math.floor(Math.random() * Math.min(shows.length, 5))];
      const speech = `Tonight, I suggest ${pick.title}. It's rated ${pick.rating} out of 10. You can find it at qudetv.com.`;

      return input.responseBuilder.speak(speech).getResponse();
    } catch {
      return input.responseBuilder
        .speak("Visit qudetv.com and tap 'Pick tonight's show' for a personalised recommendation!")
        .getResponse();
    }
  },
};

// ── Add Show ──────────────────────────────────────────────────────────────────

const AddShowIntentHandler = {
  canHandle: (input) =>
    Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
    Alexa.getIntentName(input.requestEnvelope) === 'AddShowIntent',
  handle: (input) => {
    const slots = input.requestEnvelope.request.intent.slots;
    const showName = slots?.ShowName?.value || 'that show';

    // Deep link to Qude — full add requires auth token integration
    const speech = `I've noted ${showName}. Open Qude on your phone or at qudetv.com to add it to your watchlist. Or install the Qude Chrome extension to track it automatically when you watch.`;

    return input.responseBuilder.speak(speech).getResponse();
  },
};

// ── Mark Watched ──────────────────────────────────────────────────────────────

const MarkWatchedIntentHandler = {
  canHandle: (input) =>
    Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
    Alexa.getIntentName(input.requestEnvelope) === 'MarkWatchedIntent',
  handle: (input) => {
    const slots = input.requestEnvelope.request.intent.slots;
    const showName = slots?.ShowName?.value || 'that show';

    const speech = `Great, you finished ${showName}! Open Qude to mark it as watched and rate it. Your Finish Rate Score helps other Qude users too.`;
    return input.responseBuilder.speak(speech).getResponse();
  },
};

// ── Trending ──────────────────────────────────────────────────────────────────

const TrendingIntentHandler = {
  canHandle: (input) =>
    Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
    Alexa.getIntentName(input.requestEnvelope) === 'TrendingIntent',
  handle: async (input) => {
    try {
      const data = await apiGet('/detection/popular-now');
      const popular = (data.popular || []).slice(0, 3);

      if (popular.length === 0) {
        return input.responseBuilder
          .speak("I don't have trending data right now. Check qudetv.com for what's popular.")
          .getResponse();
      }

      const names = popular.map(s => s.title);
      let speech;
      if (names.length === 1) speech = `Right now on Qude, people are watching ${names[0]}.`;
      else if (names.length === 2) speech = `Right now on Qude, people are watching ${names[0]} and ${names[1]}.`;
      else speech = `Right now on Qude, people are watching ${names[0]}, ${names[1]}, and ${names[2]}.`;

      return input.responseBuilder.speak(speech).getResponse();
    } catch {
      return input.responseBuilder
        .speak("Check qudetv.com for what's trending right now.")
        .getResponse();
    }
  },
};

// ── Help / Stop / Cancel ──────────────────────────────────────────────────────

const HelpIntentHandler = {
  canHandle: (input) =>
    Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
    Alexa.getIntentName(input.requestEnvelope) === 'AMAZON.HelpIntent',
  handle: (input) => {
    const speech = "With Qude, you can ask: what should I watch tonight, what's on my watchlist, add a show, I finished watching a show, or what's trending. What would you like?";
    return input.responseBuilder.speak(speech).reprompt(speech).getResponse();
  },
};

const StopCancelHandler = {
  canHandle: (input) =>
    Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' &&
    ['AMAZON.StopIntent', 'AMAZON.CancelIntent'].includes(Alexa.getIntentName(input.requestEnvelope)),
  handle: (input) =>
    input.responseBuilder.speak("Enjoy your show! Come back to Qude anytime.").getResponse(),
};

const ErrorHandler = {
  canHandle: () => true,
  handle: (input, error) => {
    console.error('[Qude Alexa] Error:', error);
    return input.responseBuilder
      .speak("Sorry, I had trouble with that. Please try again.")
      .reprompt("Please try again.")
      .getResponse();
  },
};

// ── Export handler ────────────────────────────────────────────────────────────

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    GetWatchlistIntentHandler,
    GetRecommendIntentHandler,
    AddShowIntentHandler,
    MarkWatchedIntentHandler,
    TrendingIntentHandler,
    HelpIntentHandler,
    StopCancelHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();

/*
  SKILL.JSON INTERACTION MODEL — create this in the Alexa Developer Console
  under Interaction Model → Intents:

  GetWatchlistIntent:
    Utterances: "what's on my watchlist", "show me my list", "what am I watching"

  GetRecommendIntent:
    Utterances: "what should I watch tonight", "recommend something", "pick a show for me"

  AddShowIntent (with slot ShowName: AMAZON.SearchQuery):
    Utterances: "add {ShowName} to my watchlist", "add {ShowName}", "put {ShowName} on my list"

  MarkWatchedIntent (with slot ShowName: AMAZON.SearchQuery):
    Utterances: "I finished {ShowName}", "I watched {ShowName}", "mark {ShowName} as watched"

  TrendingIntent:
    Utterances: "what's trending", "what are people watching", "what's popular on Qude"

  DEPLOYMENT:
  1. Create skill at developer.amazon.com/alexa
  2. Create Lambda function (Node.js 18.x) in AWS
  3. Paste this file as index.js, set env var QUDE_API_URL
  4. Add Lambda ARN as skill endpoint
  5. Add intents above in Alexa console
  6. Submit for certification
*/
