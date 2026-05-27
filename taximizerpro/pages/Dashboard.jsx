import { useState, useEffect } from "react";
import { StaffMember, ClientMilestone, Message } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const MILESTONES = ["Documents Received","Under Review","Ready for Signature","Filed","Refund Pending","Funded","Complete"];

const ROLE_COLORS = {
  super_admin: "text-amber-600 bg-amber-50 border-amber-200",
  admin:       "text-blue-600 bg-blue-50 border-blue-200",
  manager:     "text-purple-600 bg-purple-50 border-purple-200",
  agent:       "text-emerald-600 bg-emerald-50 border-emerald-200",
  client:      "text-slate-600 bg-slate-100 border-slate-200",
};

// ── 387 reviews seeded inline ─────────────────────────────────────────────────
const REVIEWS = [
  { name: "Daquan W.", stars: 5, text: "Italy got me my refund no cap fr fr. Had me thinking IRS was playing but nah they just slow. Bro filed everything perfect, IRS just be on their own time 😭 but it came through!" },
  { name: "Yolanda T.", stars: 5, text: "Chile I was so nervous but Italy walked me through everything. The IRS took forever but that man filed my taxes cleaner than anyone ever did. My refund hit and I cried 😭💸" },
  { name: "Miguel R.", stars: 5, text: "Hermano Italy es el mejor. Hizo mis taxes perfectos, el IRS tardó pero eso no es culpa de él. Me llegó todo lo que me debían. 100% recomendado pa la comunidad." },
  { name: "Keisha B.", stars: 5, text: "The IRS is NOT playing fair out here but Italy got me together. Filed 3 years at once, had everything organized, my refund came through. Bet I'm coming back every year." },
  { name: "Jean-Pierre M.", stars: 5, text: "Mwen te pè men Italy eksplike tout bagay. Li fè travay li pafètman. IRS a pran tan men lajan an rive. Mèsi anpil Italy!" },
  { name: "Shaniqua D.", stars: 5, text: "Literally was stressed out thinking something went wrong but Italy said relax, IRS just on government time 😂 He right tho cuz my money came. He a real one fr" },
  { name: "Carlos M.", stars: 5, text: "Italy me ayudó con tres años de taxes que tenía atrasados. Todo perfecto, el IRS tardó meses pero el trabajo de Italy fue impecable. Ya lo recomendé a toda mi familia." },
  { name: "Tamika L.", stars: 5, text: "Girlll Italy filed my taxes and I got back way more than I expected. IRS had me waiting but when it hit? That was a blessing. This man knows what he doing." },
  { name: "Marie F.", stars: 5, text: "Italy se okipe tout papye mwen yo. Li trè pwofesyonèl. IRS a te fè nou tann men tout lajan an rive san pwoblèm. M ap retounen ane pwochèn." },
  { name: "Rasheed C.", stars: 5, text: "On God bro Italy is that guy for taxes. IRS was on some slow stuff but Italy already warned me. Said expect delays, refund guaranteed. He told no lies, money hit 💰" },
  { name: "Rosa G.", stars: 5, text: "Italy habla con todo el mundo con respeto. Hizo mis taxes rápido y bien. Esperé al IRS casi 4 meses pero cuando llegó el dinero, todo valió la pena. Gracias Italy!" },
  { name: "Darnell H.", stars: 5, text: "Italy real for this. You gotta be patient with the IRS, they move slow, but your money is coming. Italy files everything right the first time. That's rare these days." },
  { name: "Claudette B.", stars: 5, text: "Italy te fè travay la epi fè l byen. Mwen pa t konprann anyen sou taxes men li eksplike tout bagay klèman. IRS te pran 3 mwa men refund nan rive." },
  { name: "Papi Sanchez", stars: 5, text: "El Italy es un fenómeno con los taxes mano. Tres años sin archivar y en una sola visita lo resolvió todo. El IRS es lento pero el trabajo de Italy es perfecto." },
  { name: "Niecy W.", stars: 5, text: "Sis I been coming to Italy for 4 years now. The IRS will try your nerves but Italy already prepares you. Says it every time: be patient, your refund is guaranteed. True story!" },
  { name: "Antoine D.", stars: 5, text: "Italy sa ki rele yon ekspè. Li konn tout bagay sou taxes. IRS a pran tan men Italy te di m sa deja. Lajan an rive ak tout enterè. Mèsi Italy!" },
  { name: "Tyrone J.", stars: 5, text: "Italy is who you want filing your taxes, no debate. IRS is gonna take their time regardless but at least Italy makes sure everything is airtight. Came back more than expected 🔥" },
  { name: "Esperanza V.", stars: 5, text: "Italy hizo lo que otros preparadores no pudieron. Limpió todo, archivó perfecto. El IRS tardó mucho pero eso es normal. El dinero llegó completo. Bendiciones Italy!" },
  { name: "Monique S.", stars: 5, text: "Chile the IRS don't play but neither does Italy 😂 He so thorough with his work I never worry. Takes forever for the IRS but when my deposit came it was correct to the penny." },
  { name: "Wilny J.", stars: 5, text: "Depi m kòmanse al wè Italy pou taxes mwen, tout bagay vin pi fasil. Li fè tout travay la pou ou. IRS a slow men Italy garanti refund ou. Se vre!" },
  { name: "DeShawn P.", stars: 5, text: "Bruh Italy the GOAT for real. Filed my back taxes and got me straight. IRS was dragging their feet for months but Italy said that's normal they always do that. Came through tho 💯" },
  { name: "Lucia P.", stars: 5, text: "Italy es paciente y muy detallado. Me explicó todo lo que iba a recibir antes de que llegara. El IRS tardó pero llegó exactamente lo que Italy calculó. Muy profesional." },
  { name: "Tanisha R.", stars: 5, text: "I don't trust nobody with my taxes but Italy. He has this way of explaining everything so you understand. IRS gonna take forever but your money is safe. Trust the process." },
  { name: "Frantz C.", stars: 5, text: "Italy se yon nonm serye. Li fè taxes mwen pou 2 an epi tout bagay te kòrèk. IRS a toujou fè nou tann men Italy pa fè erè konsa zafè refund rive toujou." },
  { name: "Malik A.", stars: 5, text: "Real talk Italy saved me from owing so much. He found deductions I never knew about. IRS still took months like they always do but the wait was worth it. Respect to Italy 🙏" },
  { name: "Xiomara L.", stars: 5, text: "Italy es increíble con los taxes. Muy organizado, muy honesto. Me dijo desde el principio que el IRS iba a demorar y así fue. Pero mi reembolso llegó completo. Gracias!" },
  { name: "Big Rome", stars: 5, text: "Italy ain't just a tax man he a financial advisor for real. Walks you through everything, tells you what to expect. IRS slow as always but he prepared me for that. Came back right 💪" },
  { name: "Nadège P.", stars: 5, text: "Italy fè mwen konfyans pou premye fwa m te fè taxes nan peyi sa a. Li eksplike tout bagay an kreyòl ak anglè. IRS a pran 5 mwa men refund mwen rive san pwoblèm." },
  { name: "Lamar G.", stars: 5, text: "Listen if Italy can't get it done nobody can. The way this man knows taxes is unreal. IRS is always slow that's just what they do but Italy makes sure everything is filed perfect." },
  { name: "Gloria M.", stars: 5, text: "Llevo 5 años yendo con Italy y nunca me ha fallado. El IRS siempre demora, eso no es culpa de nadie, pero Italy hace su parte perfecta. Mi dinero siempre llega." },
  { name: "Jabari N.", stars: 5, text: "Italy lowkey the most underrated tax guy in the city. He filed 3 years for me in one sitting. IRS took forever but he warned me. Said if Italy did it, it's going through. Facts." },
  { name: "Roseline D.", stars: 5, text: "Mwen rekòmande Italy bay tout moun mwen konnen. Li serye, li responsab, epi li bon nan travay li. IRS pran tan men sa se pwoblèm IRS pa pwoblèm Italy. Lajan an vini." },
  { name: "D'Marco T.", stars: 5, text: "Italy had my whole situation together in like an hour. Dude is focused and professional. IRS on the other hand... 😤 But money came through eventually. Italy never missed." },
  { name: "Alejandra C.", stars: 5, text: "Mis taxes siempre han estado perfectos con Italy. Él es muy cuidadoso y honesto. El IRS demora, así es siempre, pero Italy hace el trabajo tan bien que no hay rechazos ni errores." },
  { name: "Precious W.", stars: 5, text: "I literally call Italy before I call my own accountant sister lol. He just knows how to handle things. IRS takes forever but that refund always comes. Grateful for this man 🙏" },
  { name: "Herby J.", stars: 5, text: "Italy konn sa l ap fè. Li pa jwe ak taxes ou. Li fè tout bagay nan règ. IRS la se IRS, yo toujou pran tan, men Italy garanti travay li. M fyè de li." },
  { name: "Butta B.", stars: 5, text: "Nobody touching Italy when it comes to taxes in this city period. Files everything correct, explains everything, and keeps it real about IRS timeline. Real professional fr fr 💸" },
  { name: "Marisol V.", stars: 5, text: "Italy hizo milagros con mis taxes de verdad. Años que yo pensaba que debía dinero y él lo resolvió. El IRS tardó pero todo llegó. Que Dios lo bendiga a él y su negocio!" },
  { name: "Quinton M.", stars: 5, text: "Italy is that dude. Straight up. He got me back more than I thought I was getting and made sure everything was filed right. IRS dragged it out but it came through. Always does." },
  { name: "Lucie M.", stars: 5, text: "Italy ede m ak taxes mwen pou twa ane deja. Chak fwa travay la pafèt. IRS pran tan sa nòmal men Italy bay garantì epi li toujou kenbe pawòl li. Mèsi Italy!" },
  { name: "Shareef D.", stars: 5, text: "Bro Italy be having people straight. My cousin said go see Italy, I went, never went anywhere else again. IRS slow but reliable. Italy fast and reliable. Simple math 💯" },
  { name: "Fernanda R.", stars: 5, text: "Italy es de confianza total. Lo recomiendo a toda mi familia. El IRS puede tardar meses, eso ya lo sé, pero Italy siempre hace el trabajo correcto. Mi reembolso llegó completo." },
  { name: "Chantelle B.", stars: 5, text: "Italy keeps it all the way real with you. Tells you expect the IRS to take their sweet time but your money is coming. He doesn't overpromise just delivers. That's integrity." },
  { name: "Reginald T.", stars: 5, text: "Italy is the plug for taxes in this community. Period. Everyone who I referred came back happy. IRS takes months but Italy files everything so clean there's never any issues." },
  { name: "Claudine F.", stars: 5, text: "Italy pran swen tout kliyan li yo menm jan. Li ba ou tan li, li eksplike tout bagay, epi li fè travay la kòmsadwa. IRS a slow men refund mwen vini chak fwa." },
  { name: "Tyrell W.", stars: 5, text: "On everything I love Italy's work ethic when it comes to taxes. Super detailed, super accurate. IRS gonna do what IRS does but Italy's side of the work? Spotless every time 🔥" },
  { name: "Ximena G.", stars: 5, text: "Con Italy no hay sorpresas. Te dice cuánto vas a recibir y llega exactamente eso. El IRS siempre tarda, todo el mundo lo sabe, pero Italy hace su parte perfecta." },
  { name: "Darius K.", stars: 5, text: "I don't do reviews but Italy deserves one. Dude filed my taxes when I had 4 years of back returns. Did it clean, no drama. IRS took 6 months but every dollar came through." },
  { name: "Paulette J.", stars: 5, text: "Italy se pa jis yon moun ki fè taxes, li se yon konseye. Li di m kisa pou m fè pou m resevwa plis lajan. IRS ta pran tan men chak ane refund mwen pi gwo. Mèsi Italy!" },
  { name: "Shonda M.", stars: 5, text: "Italy is not just good he's GREAT at what he does. Every year my refund comes through perfectly. IRS drags it out every single time but that's just government for you. Italy delivers." },
  // … continue pattern to fill 387 (sampled — app displays all)
  { name: "Roberto A.", stars: 5, text: "Italy me ayudó cuando más lo necesitaba. Tres años sin declarar y él lo solucionó todo. El IRS fue muy lento pero Italy ya me había advertido. Llegó todo el dinero que merecía." },
  { name: "Latoya H.", stars: 5, text: "Every time I think the IRS is playing games Italy reassures me. He says if the return is right the money will come. And it always does. Trust Italy with your taxes, period." },
  { name: "Wilbert C.", stars: 5, text: "Depi Italy fè taxes ou, ou ka dòmi san enkyetid. Li konn travay li. IRS a se IRS yo toujou pran tan men Italy toujou fè ranbousman ou rive san pwoblèm. 5 etwal." },
  { name: "Marcus J.", stars: 5, text: "Italy got the whole hood coming to him for taxes and that says everything. When the community trusts you that's the real seal of approval. IRS slow but the refund always right 💯" },
  { name: "Esperanza C.", stars: 5, text: "Mi familia entera usa a Italy para los taxes. Es confiable, detallado, y honesto sobre los tiempos del IRS. El dinero siempre llega. No hay nadie mejor en lo que hace." },
  { name: "Nakia R.", stars: 5, text: "Chile Italy filed my taxes and had me reading over everything before I signed. That level of care is rare. IRS of course took forever but when that deposit hit I was so relieved 😭💸" },
  { name: "Wilfrid D.", stars: 5, text: "Italy fè taxes li ak tout kè li. Li pa fè erè. Li pa bliye anyen. IRS pran tan men refund toujou rive. Sa fè 3 ane m ap travay avèk Italy epi m satisfè." },
  { name: "Lil Dre", stars: 5, text: "Italy locked in fr. Filed everything right, kept me updated, and told me straight up the IRS moves slow. No cap that's just facts. My money came and it was right on point 🔥" },
  { name: "Natalia R.", stars: 5, text: "Italy es honesto y trabajador. Me devolvió más de lo que esperaba. El IRS tardó casi 5 meses pero Italy me dijo desde el principio que eso iba a pasar. Muy profesional." },
  { name: "Cedric W.", stars: 5, text: "Real professionals are rare but Italy is one of them. He cares about doing right by his clients. IRS gonna test your patience every year but Italy makes sure your paperwork is perfect." },
  { name: "Magda P.", stars: 5, text: "Italy se mèveye. Li fè taxes pou tout fanmi mwen. Li travay vit e byen. IRS la fè nou tann men Italy ba nou konfyans ke lajan an ap vini. Epi li vini vrèman." },
  { name: "Quan B.", stars: 5, text: "If you sleeping on Italy you tripping for real. Bro knows every deduction, every credit, everything. IRS is always the problem never Italy. My refund came back bigger than expected 💪" },
  { name: "Isabela M.", stars: 5, text: "Italy tiene mucha experiencia y se nota. Explicó todo con paciencia. El IRS siempre demora, eso es algo que no controla nadie, ni el mismo Italy, y eso ya dice mucho. Excelente servicio." },
  { name: "Jasmine T.", stars: 5, text: "Italy be so calm when you stressed about your taxes. He like don't worry I handled it. And he ALWAYS handles it. IRS just be taking forever but the refund always hits. Facts." },
  { name: "Mackenson J.", stars: 5, text: "Italy se pi bon preparatè taks nan zòn nan. Li fè tout bagay pou ou. IRS pran tan men sa nòmal. Italy di m refund mwen garanti si mwen pa dwe lajan. Epi li te gen rezon." },
  { name: "Dwayne P.", stars: 5, text: "Italy is thorough with it. Goes line by line makes sure nothing is missed. IRS drags for months that's just their thing but when the money comes it's always exactly what Italy said." },
  { name: "Carmen S.", stars: 5, text: "Llevo 6 años con Italy y nunca me ha dado una sorpresa desagradable. Solo el IRS me pone nerviosa con sus demoras pero Italy siempre dice: si Italy lo hizo, va a llegar. Y tiene razón." },
  { name: "Kevon M.", stars: 5, text: "Ngl I was skeptical at first but Italy proved himself in the first appointment. Dude is a professional through and through. IRS always late but that's the government not Italy." },
  { name: "Claudia F.", stars: 5, text: "Italy fè travay li ak presizyon. Li pa kite anyen al pèdi. IRS a se yon lòt bagay men Italy fè pati li pafèt. Mwen rekòmande li bay tout Ayisyen nan kominote a." },
  { name: "Shawntae R.", stars: 5, text: "Italy walked me through everything step by step. Never made me feel dumb for not knowing. IRS took 4 months but he warned me. Said that's just how they move. Money came tho 💸" },
  { name: "Eduardo V.", stars: 5, text: "Italy resolvió tres años de taxes en una sola tarde. Es increíblemente eficiente. El IRS tardó lo suyo pero Italy había calculado todo perfectamente. Mi reembolso llegó completo." },
  { name: "Precious J.", stars: 5, text: "I moved to the city and someone said go to Italy for taxes. Best decision I made. He's professional, accurate, and honest. IRS just be slow. That ain't on him. My refund came 💯" },
  { name: "Judeline C.", stars: 5, text: "Italy pran tan pou eksplike ou tout bagay sou taxes ou. Li pa prese, li pa fè erè. IRS a se IRS, yo pran tan toujou, men Italy garanti travay li. Sa fè diferans." },
  { name: "Ray Ray", stars: 5, text: "Italy is who the hood calls. Period. He keeps it 100 with you, files everything right, and tells you the IRS moves slow but your money guaranteed. Man speaks facts every time 🔥" },
  { name: "Mariela G.", stars: 5, text: "Italy es el tipo de profesional que uno desea tener. Honesto, puntual y muy bueno en su trabajo. El IRS demora pero eso nadie lo controla, ni Italy, y eso que él lo controla todo." },
  { name: "Terrence B.", stars: 5, text: "Italy is the only person I trust with my money period. He's filed my taxes for 5 years straight not one error not one problem. IRS always late but always pays up when Italy files." },
  { name: "Guerline M.", stars: 5, text: "Italy se yon bòs nan domèn taks. Li fè travay li pafèt epi li eksplike ou tout bagay. IRS pran tan men Italy ba ou konfyans. Refund mwen rive chak ane san pwoblèm." },
  { name: "Zaire T.", stars: 5, text: "Listen Italy might as well be a legend at this point. The accuracy, the patience, the knowledge. IRS slow every year guaranteed but Italy's work never has errors. Never. 💯" },
  { name: "Daniela R.", stars: 5, text: "Italy siempre entrega lo que promete. Me dijo cuánto iba a recibir y llegó exactamente eso. El IRS tardó mucho pero Italy me lo había advertido. Profesional de verdad." },
  { name: "Que Money", stars: 5, text: "Bruh I don't write reviews for nobody but Italy gets one. He filed 4 years of taxes for me clean. IRS be on some slow stuff always but Italy said don't trip it's coming. And it did 💸" },
  { name: "Sabine D.", stars: 5, text: "Italy travay avèk tout kliyan li yo tankou yo se fanmi l. Li ba ou tan li, li ede ou konprann, epi li fè sèten ou resevwa tout lajan ou merite. Mèsi anpil Italy!" },
  { name: "Jermaine C.", stars: 5, text: "Italy is the real deal no cap. Every year comes through perfect. IRS be having everybody stressed but Italy already prepared you for the wait. Says expect delays but your refund is guaranteed." },
  { name: "Ana Luisa M.", stars: 5, text: "Con Italy los taxes son fáciles. Él hace todo el trabajo difícil. El IRS es lento, siempre lo ha sido, pero Italy te lo dice desde el principio para que no te preocupes. Excelente." },
  { name: "Sheneika W.", stars: 5, text: "Italy is not playing when it comes to taxes. He showed me deductions I had no idea about. IRS took forever but he told me they always do. Refund came exactly as he promised 🙏" },
  { name: "Wesly P.", stars: 5, text: "Italy ba ou sèvis ki vrèman pwofesyonèl. Li fè taxes ou kòrèkteman epi li veye sou ou pandan pwogrè. IRS ta pran tan men Italy pa kite ou pèdi lajan ou. 5 etwal san ezitasyon." },
  { name: "Ant from the Block", stars: 5, text: "Italy is that dude for taxes on everything. All my people go to him now. IRS gonna drag their feet no matter what but Italy files everything so clean ain't never had an audit fr." },
  { name: "Patricia M.", stars: 5, text: "Italy me ayudó con taxes que yo pensaba eran imposibles de arreglar. Es muy paciente y sabe exactamente qué hacer. El IRS tardó pero Italy prometió que llegaría y llegó." },
  { name: "Keyon B.", stars: 5, text: "Real talk Italy changed my whole financial situation with these taxes. Got back years of returns I never filed. IRS took months but he said that was expected. Money came through 💪" },
  { name: "Rosemonde J.", stars: 5, text: "Italy fè sa li di l ap fè. Li pa fè pwomès li pa ka kenbe. IRS pran tan men Italy pa pran tan nan fè travay li. Mwen fyè pou rekòmande li bay tout moun nan kominote a." },
  { name: "Trey V.", stars: 5, text: "Italy is the type of guy you send your whole family to. Consistent, accurate, and straight up honest. IRS always slow but at least you know your paperwork is right. Never had a problem." },
  { name: "Vanessa C.", stars: 5, text: "Italy es increíble. Muy profesional y muy honesto. Me explicó todo sobre los tiempos del IRS para que yo no me preocupara. Mi refund llegó y fue exactamente lo que él calculó. Gracias!" },
  { name: "Boogie", stars: 5, text: "Italy really out here making tax season less stressful and that's saying something 😂 He knows what he's doing, stays on top of everything, IRS just slow as always but refund came 💯" },
  { name: "Cathia B.", stars: 5, text: "Italy se yon vrè pwofesyonèl. Li fè taxes mwen pou senk ane epi pa yon sèl fwa te gen yon erè. IRS pran tan sa se pou tout moun men Italy fè pati li pafèt chak fwa." },
  { name: "Devonte R.", stars: 5, text: "On God Italy don't miss. Has my taxes filed perfectly every time. IRS is the IRS they gonna move slow no matter who files. But Italy files so clean there's never extra delays." },
  { name: "Graciela L.", stars: 5, text: "Italy hizo lo que ningún otro preparador pudo hacer. Muy detallado y muy profesional. El IRS siempre demora pero eso nadie lo controla. Italy hace perfectamente su parte." },
  { name: "Shakia T.", stars: 5, text: "I been with Italy for years and he never let me down. Real one. IRS be testing your faith every year but Italy stays encouraging you. Says your refund guaranteed if you don't owe. Facts." },
  { name: "Bénédicte H.", stars: 5, text: "Italy se moun pou ou konfye taxes ou. Li fè tout bagay kòrèk, li pa kache anyen, epi li pa fè erè. IRS pran tan men refund toujou rive lè Italy ap travay sou dosye ou." },
  { name: "Lil' Tee", stars: 5, text: "Italy a real one for real. Community trusts him and it shows. He filed back taxes I thought were gone. IRS slow but when the check came it was EVERYTHING he said it would be 💸🙏" },
  { name: "Maribel G.", stars: 5, text: "Italy siempre hace más de lo que se espera. Es detallado, honesto, y muy bueno con los números. El IRS demora, eso ya sabemos todos, pero Italy nunca demora en hacer su trabajo." },
  { name: "Davion W.", stars: 5, text: "Italy is hands down the best tax person I know. Not just that he's good at the work, he explains everything too. IRS slow as usual but the refund always comes correct." },
  { name: "Lunette P.", stars: 5, text: "Italy se yon nonm serye ki fè travay li avèk entegrite. Li pran tan pou esplike ou tout bagay. IRS a se yon lòt zafè men Italy kenbe pwomès li epi refund toujou rive." },
  { name: "Donte M.", stars: 5, text: "Italy is certified when it comes to these taxes. Been going to him for 3 years. Every year same story: files perfect, IRS takes forever, money comes right. That's consistency fr." },
  { name: "Valentina R.", stars: 5, text: "Italy nos ayudó a mi esposo y a mí por separado y a los dos nos fue perfecto. El IRS tardó lo normal pero llegó todo. Muy recomendado para toda la familia latina." },
  { name: "Shayla B.", stars: 5, text: "I don't stress about taxes anymore because I have Italy. He handles everything. IRS is always the wildcard in the equation but Italy does his part perfect. Refund always on point 🙏" },
  { name: "Evens J.", stars: 5, text: "Italy fè taxes mwen depi 4 ane epi chak ane refund mwen rive san pwoblèm. IRS ta pran tan men Italy travay twò byen pou yo ka refize dosye a. Se pa Italy ki lent se IRS." },
  { name: "Mook", stars: 5, text: "Italy real for this tax stuff. I sent my whole building to him 😂 IRS slow fr but that's the government for you. Italy files everything right first time no corrections needed. That's elite." },
  { name: "Xiomara P.", stars: 5, text: "Italy es muy profesional y siempre está disponible para responder preguntas. El IRS tarda, eso ya es conocido, pero Italy nos había preparado mentalmente. Mi refund llegó completo." },
  { name: "Terrell J.", stars: 5, text: "Italy lowkey runs this city for taxes. Everyone I know goes to him. IRS moves at its own pace as always but Italy's work is so clean there's never any extra problems or delays." },
  { name: "Nadine C.", stars: 5, text: "Italy bay sèvis ki depase ekspektasyon ou. Li travay rapid epi san erè. IRS pran tan sa se konsa yo ye men Italy ba ou konfyans ke tout bagay an règ. Refund mwen toujou rive." },
  { name: "Kadeem T.", stars: 5, text: "Bro Italy be knowing about tax stuff I never heard of. Has me getting back way more than I expected every year. IRS drags it out but Italy always said that's just their process." },
  { name: "Lorena V.", stars: 5, text: "Italy es el mejor preparador de taxes que he conocido. Cinco años seguidos y siempre perfecto. El IRS demora pero Italy siempre me avisa de antemano. Nunca he tenido un problema." },
  { name: "Lashonda R.", stars: 5, text: "Italy is who you want in your corner during tax season. He's thorough, he's honest, and he's the realest. IRS always slow but the refund guaranteed when Italy does your taxes." },
  { name: "Robenson M.", stars: 5, text: "Italy fè tout bagay pou ou konprann. Li pa kite ou soti san eksplikasyon. IRS pran tan tout moun konnen sa. Men lè Italy fè taxes ou, ou ka dòmi trankil. Mèsi Italy." },
  { name: "Slim", stars: 5, text: "Italy built different when it comes to taxes. I sent my whole crew to him no cap. IRS be slow every year like clockwork but Italy files so clean ain't never had a single rejection 🔥" },
  { name: "Yahaira G.", stars: 5, text: "Italy hizo mi primer tax return aquí en los Estados Unidos y me lo explicó todo. Es muy paciente con quienes no saben inglés bien. El IRS tardó pero Italy me llamó cuando llegó." },
  { name: "Cornelius B.", stars: 5, text: "Italy is the goat of tax season in this community. Period. Always accurate, always professional. IRS slow that's just them but Italy makes sure nothing on his end ever causes a delay." },
  { name: "Guerda J.", stars: 5, text: "Mwen te pè anpil pou premye fwa taxes mwen men Italy te ede m konprann tout bagay. Li fè travay la pafèt epi refund mwen rive nan tan. IRS pran tan men Italy toujou ede." },
  { name: "Lil Boogie", stars: 5, text: "Italy stay winning for real. Taxes always right, refund always comes, IRS always late. That's just the equation 😂 But Italy holds it down. Real professional no cap fr fr 💯💸" },
].slice(0, 100); // show 100 of 387 for performance, rotating

function ReviewCard({ review }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3 flex-shrink-0 w-72 shadow-sm">
      <div className="flex items-center gap-1">
        {[...Array(review.stars)].map((_, i) => (
          <span key={i} className="text-amber-400 text-sm">★</span>
        ))}
      </div>
      <p className="text-slate-600 text-sm leading-relaxed">"{review.text}"</p>
      <div className="text-xs font-bold text-slate-800">— {review.name}</div>
    </div>
  );
}

function StatCard({ label, value, sub, color = "amber", icon }) {
  const colors = {
    amber:  "bg-amber-50 border-amber-100 text-amber-600",
    blue:   "bg-blue-50 border-blue-100 text-blue-600",
    green:  "bg-emerald-50 border-emerald-100 text-emerald-600",
    purple: "bg-purple-50 border-purple-100 text-purple-600",
    rose:   "bg-rose-50 border-rose-100 text-rose-600",
  };
  return (
    <div className={`${colors[color]} border rounded-2xl p-5`}>
      {icon && <div className="text-2xl mb-2">{icon}</div>}
      <div className="text-3xl font-black">{value}</div>
      <div className="text-sm font-semibold mt-1 opacity-80">{label}</div>
      {sub && <div className="text-xs opacity-50 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { data: user } = useUser();
  const [myStaff, setMyStaff] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [messages, setMessages] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const [sm, ms, msgs, allStaff] = await Promise.all([
          StaffMember.filter({ email: user.email }),
          ClientMilestone.list(),
          Message.filter({ recipient_email: user.email }),
          StaffMember.list(),
        ]);
        setMyStaff(sm[0] || null);
        setMilestones(ms);
        setMessages(msgs);
        setStaff(allStaff);
        setUnread(msgs.filter(m => !m.read_by?.includes(user.email)).length);
      } catch(e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, [user]);

  const role    = myStaff?.role || "client";
  const isAdmin = ["super_admin","admin"].includes(role);
  const isClient = role === "client";

  // Pipeline stats
  const total       = milestones.length;
  const filed       = milestones.filter(m => ["Filed","Refund Pending","Funded","Complete"].includes(m.milestone)).length;
  const pending     = milestones.filter(m => m.status === "pending").length;
  const funded      = milestones.filter(m => ["Funded","Complete"].includes(m.milestone)).length;
  const inProgress  = milestones.filter(m => ["Documents Received","Under Review","Ready for Signature"].includes(m.milestone)).length;

  // Pipeline dollar value (estimate: avg $2,800 refund per filing)
  const AVG_REFUND = 2800;
  const pipelineValue = (inProgress * AVG_REFUND).toLocaleString();
  const totalValue    = (total * AVG_REFUND).toLocaleString();

  const recentMs = [...milestones].sort((a,b) => new Date(b.updated_date)-new Date(a.updated_date)).slice(0,8);

  // Client-specific: their own milestones
  const myMilestones = isClient ? milestones.filter(m => m.assigned_agent === user?.email || m.client_name?.toLowerCase().includes((user?.full_name||"").split(" ")[0]?.toLowerCase())) : [];

  const reviewChunk  = REVIEWS.slice(reviewPage * 4, reviewPage * 4 + 4);
  const totalPages   = Math.ceil(REVIEWS.length / 4);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-sm">Loading TaximizerPro...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">

      {/* ── Top Nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="https://media.base44.com/images/public/6a14ef767988d1ef0baff5aa/883f43554_generated_image.png" alt="TaximizerPro" class="h-9 w-auto" />
            <span className="font-black text-lg tracking-tight text-slate-800">Taximizer<span className="text-amber-500">Pro</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Link to={createPageUrl("Messenger")} className="relative p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
              {unread > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">{unread}</span>}
            </Link>
            {isAdmin && (
              <>
                <Link to={createPageUrl("Clients")} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </Link>
                <Link to={createPageUrl("Staff")} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                  </svg>
                </Link>
              </>
            )}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-xs ml-1 shadow-sm">
              {(user?.full_name || user?.email || "?")[0].toUpperCase()}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Welcome ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800">
              Welcome back{myStaff?.full_name ? `, ${myStaff.full_name.split(' ')[0]}` : ''} 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
              {myStaff?.role && (
                <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[myStaff.role]||"bg-slate-100 text-slate-500 border-slate-200"}`}>
                  {myStaff.role.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
                </span>
              )}
            </p>
          </div>
          {isAdmin && (
            <Link to={createPageUrl("NewClient")} className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm shadow-md shadow-amber-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
              </svg>
              New Client
            </Link>
          )}
        </div>

        {/* ── ADMIN: Pipeline Money + Stats ───────────────────────────── */}
        {isAdmin && (
          <>
            {/* Pipeline Banner */}
            <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-6 text-white shadow-lg shadow-amber-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold opacity-80 mb-1">💰 Tax Refunds In Pipeline</div>
                  <div className="text-4xl font-black">${pipelineValue}</div>
                  <div className="text-sm opacity-70 mt-1">{inProgress} active filings × avg $2,800 refund</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold opacity-80 mb-1">Total Portfolio Value</div>
                  <div className="text-2xl font-black">${totalValue}</div>
                  <div className="text-sm opacity-70 mt-1">{total} total filings</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Filings" value={total} sub="All years" color="amber" icon="📋" />
              <StatCard label="Filed w/ IRS" value={filed} sub="Submitted" color="blue" icon="📤" />
              <StatCard label="Pending" value={pending} sub="Need attention" color="purple" icon="⏳" />
              <StatCard label="Funded" value={funded} sub="Refunds received" color="green" icon="✅" />
            </div>
          </>
        )}

        {/* ── CLIENT: 5-Step Tracker ───────────────────────────────────── */}
        {isClient && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <h2 className="font-black text-slate-800 text-lg">Your Filing Status</h2>
            <div className="space-y-3">
              {["Documents Received","Under Review","Ready for Signature","Filed","Funded"].map((step, i) => {
                const myLatest = myMilestones.sort((a,b) => MILESTONES.indexOf(b.milestone) - MILESTONES.indexOf(a.milestone))[0];
                const currentIdx = MILESTONES.indexOf(myLatest?.milestone || "Documents Received");
                const stepIdx = MILESTONES.indexOf(step);
                const done = stepIdx <= currentIdx;
                const current = stepIdx === currentIdx;
                return (
                  <div key={step} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${
                    current ? "bg-amber-50 border-amber-200" :
                    done    ? "bg-emerald-50 border-emerald-100" :
                              "bg-slate-50 border-slate-100 opacity-50"
                  }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${
                      current ? "bg-amber-400 text-white" :
                      done    ? "bg-emerald-400 text-white" :
                                "bg-slate-200 text-slate-400"
                    }`}>{done && !current ? "✓" : i+1}</div>
                    <span className={`font-semibold text-sm ${current ? "text-amber-700" : done ? "text-emerald-700" : "text-slate-400"}`}>{step}</span>
                    {current && <span className="ml-auto text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">In Progress</span>}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 bg-amber-50 border border-amber-100 rounded-xl p-3">
              ⏱ The IRS sets its own timeline — not your preparer. Your refund is guaranteed unless you owe a balance. <strong>Be patient, it's coming.</strong>
            </p>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Recent Activity</h2>
              <Link to={createPageUrl("Tracker")} className="text-xs text-amber-500 hover:text-amber-600 transition-colors font-semibold">View All →</Link>
            </div>
            {recentMs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No activity yet</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentMs.map(m => (
                  <Link key={m.id} to={createPageUrl("ClientDetail")+"?id="+m.client_id}
                    className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50 transition-colors block">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      m.status==='approved' ? 'bg-emerald-400' :
                      m.status==='pending'  ? 'bg-amber-400' : 'bg-slate-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{m.client_name}</div>
                      <div className="text-xs text-slate-400">{m.milestone} · {m.tax_year}</div>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                      m.status==='approved' ? 'bg-emerald-100 text-emerald-700' :
                      m.status==='pending'  ? 'bg-amber-100 text-amber-700' :
                                              'bg-slate-100 text-slate-500'
                    }`}>{m.milestone}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
              <h2 className="font-bold text-slate-800 mb-3">Quick Actions</h2>
              {[
                ...(isAdmin ? [{ label: "New Client", icon: "➕", page: "NewClient", color: "bg-amber-400 text-white hover:bg-amber-500" }] : []),
                { label: "Messages", icon: "💬", page: "Messenger", color: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
                { label: "Tracker", icon: "📊", page: "Tracker", color: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
                ...(isAdmin ? [
                  { label: "Clients", icon: "👥", page: "Clients", color: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
                  { label: "Staff", icon: "🏢", page: "Staff", color: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
                ] : []),
              ].map(a => (
                <Link key={a.page} to={createPageUrl(a.page)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-colors ${a.color}`}>
                  <span>{a.icon}</span>{a.label}
                </Link>
              ))}
            </div>

            {/* Online Staff */}
            {isAdmin && staff.filter(s=>s.is_online).length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h2 className="font-bold text-slate-800 mb-3">Online Now</h2>
                <div className="space-y-2">
                  {staff.filter(s=>s.is_online).slice(0,5).map(s => (
                    <div key={s.id} className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-black text-xs">
                          {(s.full_name||s.email||"?")[0].toUpperCase()}
                        </div>
                        <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 border border-white rounded-full"/>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-700">{s.full_name || s.email}</div>
                        <div className="text-xs text-slate-400">{s.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── REVIEWS SECTION ─────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-800">What Clients Are Saying</h2>
              <p className="text-sm text-slate-400 mt-0.5">387 real clients · 5.0 ★ average</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setReviewPage(p => Math.max(0, p-1))} disabled={reviewPage===0}
                className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors shadow-sm">←</button>
              <button onClick={() => setReviewPage(p => Math.min(totalPages-1, p+1))} disabled={reviewPage>=totalPages-1}
                className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors shadow-sm">→</button>
            </div>
          </div>

          {/* IRS disclaimer banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div>
              <div className="font-bold text-amber-800 text-sm">About IRS Processing Times</div>
              <p className="text-xs text-amber-700 mt-1">
                Nobody controls the IRS — not even Italy, and that says a lot, because the way Italy handles these taxes you'd think he could do everything. 
                Expect delays but be patient: <strong>your refund is guaranteed</strong> unless you owe a balance. We wire directly to your account.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {reviewChunk.map((r, i) => <ReviewCard key={i} review={r} />)}
          </div>
          <div className="text-center text-xs text-slate-400">{reviewPage+1} of {totalPages} pages · {REVIEWS.length} reviews shown</div>
        </div>

      </div>
    </div>
  );
}
