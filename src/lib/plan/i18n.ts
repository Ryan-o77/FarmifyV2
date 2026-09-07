/**
 * Translations.
 *
 * The four languages here are the ones actually spoken on San Joaquin Valley
 * farms: English, Spanish, Punjabi and Hmong. Roughly a third of California's
 * farm operators and a large majority of the farm workforce speak a language
 * other than English at home, and an irrigation schedule that only one person on
 * the crew can read is not a schedule.
 *
 * Two rules shaped the wording:
 *
 *   1. Every string is a whole sentence or a whole label. Sentences are never
 *      assembled from translated fragments, because word order differs between
 *      these languages and a fragment that reads correctly in English becomes
 *      nonsense in Punjabi.
 *   2. The simple summary avoids technical vocabulary entirely. There is no
 *      "evapotranspiration" or "depletion" in it -- only how long to run the
 *      water, on which day, and what to watch for.
 */

import type { Language } from "../types";

export type MessageKey =
  | "app.tagline"
  | "plan.thisWeek"
  | "plan.whatToDo"
  | "plan.noWaterThisWeek"
  | "plan.restDay"
  | "plan.water"
  | "plan.startAt"
  | "plan.runFor"
  | "plan.hours"
  | "plan.minutes"
  | "plan.amount"
  | "plan.gallons"
  | "plan.inches"
  | "plan.totalThisWeek"
  | "plan.why"
  | "plan.weather"
  | "plan.hotWeek"
  | "plan.mildWeek"
  | "plan.rainLikely"
  | "plan.rainUnlikely"
  | "plan.checkSoil"
  | "plan.cycles"
  | "plan.soakBetween"
  | "plan.waterLimitOn"
  | "plan.printTitle"
  | "plan.preparedFor"
  | "plan.field"
  | "plan.crop"
  | "plan.day"
  | "plan.time"
  | "plan.duration"
  | "plan.watchFor.tooWet"
  | "plan.watchFor.tooDry"
  | "plan.feedbackAsk"
  | "feedback.tooWet"
  | "feedback.tooDry"
  | "feedback.justRight"
  | "feedback.runoff"
  | "feedback.cannotRun"
  | "feedback.systemProblem"
  | "weekday.0"
  | "weekday.1"
  | "weekday.2"
  | "weekday.3"
  | "weekday.4"
  | "weekday.5"
  | "weekday.6";

type Catalogue = Record<MessageKey, string>;

const en: Catalogue = {
  "app.tagline": "Irrigation planning from Fresno weather history",
  "plan.thisWeek": "This week",
  "plan.whatToDo": "What to do",
  "plan.noWaterThisWeek": "No watering needed this week.",
  "plan.restDay": "No water today",
  "plan.water": "Water",
  "plan.startAt": "Start at",
  "plan.runFor": "Run for",
  "plan.hours": "hours",
  "plan.minutes": "minutes",
  "plan.amount": "Amount",
  "plan.gallons": "gallons",
  "plan.inches": "inches",
  "plan.totalThisWeek": "Total water this week",
  "plan.why": "Why",
  "plan.weather": "Weather",
  "plan.hotWeek": "This will be a hot week. The plants will drink more.",
  "plan.mildWeek": "The weather will be mild. The plants will drink less.",
  "plan.rainLikely": "Rain is likely. If it rains more than a quarter inch, skip the next watering.",
  "plan.rainUnlikely": "Rain is not expected.",
  "plan.checkSoil": "Dig down a hand's depth the day after watering. It should be damp, not muddy and not dry.",
  "plan.cycles": "Split into shorter runs",
  "plan.soakBetween": "Wait between runs so the water soaks in",
  "plan.waterLimitOn": "You have a water limit. This plan uses less water on purpose.",
  "plan.printTitle": "Watering plan",
  "plan.preparedFor": "Prepared for",
  "plan.field": "Field",
  "plan.crop": "Crop",
  "plan.day": "Day",
  "plan.time": "Time",
  "plan.duration": "How long",
  "plan.watchFor.tooWet": "If water stands on the ground, stop early and tell us.",
  "plan.watchFor.tooDry": "If leaves curl or look dull in the afternoon, water sooner and tell us.",
  "plan.feedbackAsk": "After you water, tell us how the ground looked. The plan will change to fit your field.",
  "feedback.tooWet": "Ground was too wet",
  "feedback.tooDry": "Ground was too dry",
  "feedback.justRight": "Ground was just right",
  "feedback.runoff": "Water ran off or stood",
  "feedback.cannotRun": "I could not follow the schedule",
  "feedback.systemProblem": "Something is wrong with the system",
  "weekday.0": "Sunday",
  "weekday.1": "Monday",
  "weekday.2": "Tuesday",
  "weekday.3": "Wednesday",
  "weekday.4": "Thursday",
  "weekday.5": "Friday",
  "weekday.6": "Saturday",
};

const es: Catalogue = {
  "app.tagline": "Plan de riego basado en el historial del clima de Fresno",
  "plan.thisWeek": "Esta semana",
  "plan.whatToDo": "Que hacer",
  "plan.noWaterThisWeek": "No hace falta regar esta semana.",
  "plan.restDay": "Hoy no se riega",
  "plan.water": "Regar",
  "plan.startAt": "Empezar a las",
  "plan.runFor": "Dejar correr",
  "plan.hours": "horas",
  "plan.minutes": "minutos",
  "plan.amount": "Cantidad",
  "plan.gallons": "galones",
  "plan.inches": "pulgadas",
  "plan.totalThisWeek": "Agua total esta semana",
  "plan.why": "Por que",
  "plan.weather": "Clima",
  "plan.hotWeek": "Va a ser una semana calurosa. Las plantas van a tomar mas agua.",
  "plan.mildWeek": "El clima va a estar fresco. Las plantas van a tomar menos agua.",
  "plan.rainLikely": "Es probable que llueva. Si llueve mas de un cuarto de pulgada, no riegue la proxima vez.",
  "plan.rainUnlikely": "No se espera lluvia.",
  "plan.checkSoil": "Escarbe el ancho de una mano el dia despues de regar. Debe estar humeda, ni lodosa ni seca.",
  "plan.cycles": "Dividir en riegos mas cortos",
  "plan.soakBetween": "Espere entre riegos para que el agua se meta en la tierra",
  "plan.waterLimitOn": "Usted tiene un limite de agua. Este plan usa menos agua a proposito.",
  "plan.printTitle": "Plan de riego",
  "plan.preparedFor": "Preparado para",
  "plan.field": "Parcela",
  "plan.crop": "Cultivo",
  "plan.day": "Dia",
  "plan.time": "Hora",
  "plan.duration": "Cuanto tiempo",
  "plan.watchFor.tooWet": "Si el agua se queda encima de la tierra, pare antes y avisenos.",
  "plan.watchFor.tooDry": "Si las hojas se enrollan o se ven opacas en la tarde, riegue antes y avisenos.",
  "plan.feedbackAsk": "Despues de regar, diganos como quedo la tierra. El plan va a cambiar para su parcela.",
  "feedback.tooWet": "La tierra quedo muy mojada",
  "feedback.tooDry": "La tierra quedo muy seca",
  "feedback.justRight": "La tierra quedo bien",
  "feedback.runoff": "El agua se escurrio o se encharco",
  "feedback.cannotRun": "No pude seguir el horario",
  "feedback.systemProblem": "Hay un problema con el sistema",
  "weekday.0": "Domingo",
  "weekday.1": "Lunes",
  "weekday.2": "Martes",
  "weekday.3": "Miercoles",
  "weekday.4": "Jueves",
  "weekday.5": "Viernes",
  "weekday.6": "Sabado",
};

const pa: Catalogue = {
  "app.tagline": "ਫ੍ਰੈਜ਼ਨੋ ਦੇ ਮੌਸਮ ਦੇ ਪੁਰਾਣੇ ਰਿਕਾਰਡ ਤੋਂ ਬਣੀ ਸਿੰਚਾਈ ਯੋਜਨਾ",
  "plan.thisWeek": "ਇਸ ਹਫ਼ਤੇ",
  "plan.whatToDo": "ਕੀ ਕਰਨਾ ਹੈ",
  "plan.noWaterThisWeek": "ਇਸ ਹਫ਼ਤੇ ਪਾਣੀ ਲਾਉਣ ਦੀ ਲੋੜ ਨਹੀਂ।",
  "plan.restDay": "ਅੱਜ ਪਾਣੀ ਨਹੀਂ ਲਾਉਣਾ",
  "plan.water": "ਪਾਣੀ ਲਾਓ",
  "plan.startAt": "ਸ਼ੁਰੂ ਕਰੋ",
  "plan.runFor": "ਇੰਨੀ ਦੇਰ ਚਲਾਓ",
  "plan.hours": "ਘੰਟੇ",
  "plan.minutes": "ਮਿੰਟ",
  "plan.amount": "ਮਾਤਰਾ",
  "plan.gallons": "ਗੈਲਨ",
  "plan.inches": "ਇੰਚ",
  "plan.totalThisWeek": "ਇਸ ਹਫ਼ਤੇ ਦਾ ਕੁੱਲ ਪਾਣੀ",
  "plan.why": "ਕਿਉਂ",
  "plan.weather": "ਮੌਸਮ",
  "plan.hotWeek": "ਇਹ ਹਫ਼ਤਾ ਗਰਮ ਰਹੇਗਾ। ਬੂਟੇ ਵੱਧ ਪਾਣੀ ਪੀਣਗੇ।",
  "plan.mildWeek": "ਮੌਸਮ ਠੰਢਾ ਰਹੇਗਾ। ਬੂਟੇ ਘੱਟ ਪਾਣੀ ਪੀਣਗੇ।",
  "plan.rainLikely": "ਮੀਂਹ ਪੈਣ ਦੀ ਸੰਭਾਵਨਾ ਹੈ। ਜੇ ਚੌਥਾਈ ਇੰਚ ਤੋਂ ਵੱਧ ਮੀਂਹ ਪਵੇ ਤਾਂ ਅਗਲੀ ਵਾਰ ਪਾਣੀ ਨਾ ਲਾਓ।",
  "plan.rainUnlikely": "ਮੀਂਹ ਦੀ ਉਮੀਦ ਨਹੀਂ ਹੈ।",
  "plan.checkSoil": "ਪਾਣੀ ਲਾਉਣ ਤੋਂ ਅਗਲੇ ਦਿਨ ਇੱਕ ਹੱਥ ਡੂੰਘਾ ਪੁੱਟ ਕੇ ਵੇਖੋ। ਮਿੱਟੀ ਸਿੱਲ੍ਹੀ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ, ਨਾ ਚਿੱਕੜ ਨਾ ਸੁੱਕੀ।",
  "plan.cycles": "ਛੋਟੇ ਹਿੱਸਿਆਂ ਵਿੱਚ ਵੰਡੋ",
  "plan.soakBetween": "ਹਰ ਹਿੱਸੇ ਦੇ ਵਿਚਕਾਰ ਰੁਕੋ ਤਾਂ ਜੋ ਪਾਣੀ ਜ਼ਮੀਨ ਵਿੱਚ ਜਾ ਸਕੇ",
  "plan.waterLimitOn": "ਤੁਹਾਡੇ ਕੋਲ ਪਾਣੀ ਦੀ ਹੱਦ ਹੈ। ਇਹ ਯੋਜਨਾ ਜਾਣ-ਬੁੱਝ ਕੇ ਘੱਟ ਪਾਣੀ ਵਰਤਦੀ ਹੈ।",
  "plan.printTitle": "ਪਾਣੀ ਲਾਉਣ ਦੀ ਯੋਜਨਾ",
  "plan.preparedFor": "ਇਹਨਾਂ ਲਈ ਤਿਆਰ ਕੀਤੀ",
  "plan.field": "ਖੇਤ",
  "plan.crop": "ਫ਼ਸਲ",
  "plan.day": "ਦਿਨ",
  "plan.time": "ਸਮਾਂ",
  "plan.duration": "ਕਿੰਨੀ ਦੇਰ",
  "plan.watchFor.tooWet": "ਜੇ ਪਾਣੀ ਜ਼ਮੀਨ ਉੱਤੇ ਖੜ੍ਹਾ ਰਹੇ ਤਾਂ ਪਹਿਲਾਂ ਬੰਦ ਕਰੋ ਅਤੇ ਸਾਨੂੰ ਦੱਸੋ।",
  "plan.watchFor.tooDry": "ਜੇ ਪੱਤੇ ਮੁੜਨ ਜਾਂ ਦੁਪਹਿਰ ਨੂੰ ਮੁਰਝਾਏ ਲੱਗਣ ਤਾਂ ਪਹਿਲਾਂ ਪਾਣੀ ਲਾਓ ਅਤੇ ਸਾਨੂੰ ਦੱਸੋ।",
  "plan.feedbackAsk": "ਪਾਣੀ ਲਾਉਣ ਤੋਂ ਬਾਅਦ ਸਾਨੂੰ ਦੱਸੋ ਕਿ ਮਿੱਟੀ ਕਿਹੋ ਜਿਹੀ ਸੀ। ਯੋਜਨਾ ਤੁਹਾਡੇ ਖੇਤ ਮੁਤਾਬਕ ਬਦਲ ਜਾਵੇਗੀ।",
  "feedback.tooWet": "ਮਿੱਟੀ ਬਹੁਤ ਗਿੱਲੀ ਸੀ",
  "feedback.tooDry": "ਮਿੱਟੀ ਬਹੁਤ ਸੁੱਕੀ ਸੀ",
  "feedback.justRight": "ਮਿੱਟੀ ਠੀਕ ਸੀ",
  "feedback.runoff": "ਪਾਣੀ ਵਹਿ ਗਿਆ ਜਾਂ ਖੜ੍ਹਾ ਰਿਹਾ",
  "feedback.cannotRun": "ਮੈਂ ਸਮਾਂ-ਸਾਰਣੀ ਨਹੀਂ ਚਲਾ ਸਕਿਆ",
  "feedback.systemProblem": "ਸਿਸਟਮ ਵਿੱਚ ਕੋਈ ਖਰਾਬੀ ਹੈ",
  "weekday.0": "ਐਤਵਾਰ",
  "weekday.1": "ਸੋਮਵਾਰ",
  "weekday.2": "ਮੰਗਲਵਾਰ",
  "weekday.3": "ਬੁੱਧਵਾਰ",
  "weekday.4": "ਵੀਰਵਾਰ",
  "weekday.5": "ਸ਼ੁੱਕਰਵਾਰ",
  "weekday.6": "ਸ਼ਨੀਵਾਰ",
};

const hmn: Catalogue = {
  "app.tagline": "Kev npaj ywg dej raws li Fresno cov ntaub ntawv huab cua",
  "plan.thisWeek": "Lub lim tiam no",
  "plan.whatToDo": "Yuav ua dab tsi",
  "plan.noWaterThisWeek": "Lub lim tiam no tsis tas ywg dej.",
  "plan.restDay": "Hnub no tsis ywg dej",
  "plan.water": "Ywg dej",
  "plan.startAt": "Pib thaum",
  "plan.runFor": "Kheev nws khiav",
  "plan.hours": "teev",
  "plan.minutes": "feeb",
  "plan.amount": "Pes tsawg",
  "plan.gallons": "galoos",
  "plan.inches": "nti",
  "plan.totalThisWeek": "Tag nrho cov dej lub lim tiam no",
  "plan.why": "Vim li cas",
  "plan.weather": "Huab cua",
  "plan.hotWeek": "Lub lim tiam no yuav kub heev. Cov nroj yuav haus dej ntau dua.",
  "plan.mildWeek": "Huab cua yuav txias. Cov nroj yuav haus dej tsawg dua.",
  "plan.rainLikely": "Yuav los nag. Yog nag los ntau tshaj ib feem plaub nti, txhob ywg dej zaum tom ntej.",
  "plan.rainUnlikely": "Tsis xav tias yuav los nag.",
  "plan.checkSoil": "Khawb ib tes tob hnub tom qab ywg dej. Cov av yuav tsum noo, tsis txhob ua avnkos thiab tsis txhob qhuav.",
  "plan.cycles": "Faib ua ntau zaug luv luv",
  "plan.soakBetween": "Tos ntawm txhua zaug kom dej nkag rau hauv av",
  "plan.waterLimitOn": "Koj muaj dej txwv. Txoj kev npaj no siv dej tsawg dua txhob txwm.",
  "plan.printTitle": "Txoj kev npaj ywg dej",
  "plan.preparedFor": "Npaj rau",
  "plan.field": "Daim teb",
  "plan.crop": "Qoob loo",
  "plan.day": "Hnub",
  "plan.time": "Sijhawm",
  "plan.duration": "Ntev npaum li cas",
  "plan.watchFor.tooWet": "Yog dej nyob saum npoo av, nres ua ntej thiab qhia rau peb.",
  "plan.watchFor.tooDry": "Yog cov nplooj kis los yog tsis ci thaum tav su, ywg dej sai dua thiab qhia rau peb.",
  "plan.feedbackAsk": "Tom qab koj ywg dej, qhia rau peb seb cov av zoo li cas. Txoj kev npaj yuav hloov raws koj daim teb.",
  "feedback.tooWet": "Cov av ntub dhau",
  "feedback.tooDry": "Cov av qhuav dhau",
  "feedback.justRight": "Cov av zoo lawm",
  "feedback.runoff": "Dej ntws tawm los yog nyob saum av",
  "feedback.cannotRun": "Kuv ua tsis tau raws sijhawm teem",
  "feedback.systemProblem": "Muaj teeb meem nrog lub cuab yeej",
  "weekday.0": "Hnub Kaj",
  "weekday.1": "Hnub Ib",
  "weekday.2": "Hnub Ob",
  "weekday.3": "Hnub Peb",
  "weekday.4": "Hnub Plaub",
  "weekday.5": "Hnub Tsib",
  "weekday.6": "Hnub Rau",
};

const CATALOGUES: Record<Language, Catalogue> = { en, es, pa, hmn };

export function t(language: Language, key: MessageKey): string {
  return CATALOGUES[language]?.[key] ?? CATALOGUES.en[key] ?? key;
}

/** A translator bound to one language, for readability at call sites. */
export function translator(language: Language): (key: MessageKey) => string {
  return (key) => t(language, key);
}

/** Languages whose scripts need a larger base size to stay readable in print. */
export function needsLargerType(language: Language): boolean {
  return language === "pa";
}
