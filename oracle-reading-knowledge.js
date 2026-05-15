(function(global){
  'use strict';

  const loveSubtypes={
    reconciliation:{
      oracle:{
        themeTerms:['復縁','元恋人','過去','別れ','信頼','曖昧','連絡','寂しさ','懐かしさ','本気','区切り'],
        compassFallback:'今週の羅針盤は、まだ好きかどうかを測ることではなく、過去の原因を一つ確認することです。懐かしさで戻る前に、信頼を作り直せる会話ができるかを見てください。',
        messageFallback:'ここまでのあなたは、元恋人とのつながりを切りきれないまま、もう一度信頼を作れるのかを見極めようとしてきたはずです。今週は、懐かしさではなく、過去の原因に向き合える反応があるかを確認してください。',
        replacements:[
          ['ここまでのあなたは、自分なりのやり方で何とか持ちこたえてきたはずです。','ここまでのあなたは、元恋人とのつながりを切りきれないまま、もう一度信頼を作れるのかを見極めようとしてきたはずです。'],
          ['一人で抱え込むより','相手の本気度を一人で想像し続けるより'],
          ['選択肢を増やしてから動く','過去の原因を確認してから動く'],
          ['感情・現実の条件・確認すべきこと','未練・過去の原因・信頼を作り直せる条件']
        ]
      }
    }
  };

  const knowledge={
    version:'2026-05-15',
    loveSubtypes
  };

  global.RASHIN_ORACLE_READING_KNOWLEDGE=Object.freeze(knowledge);
})(typeof window!=='undefined'?window:globalThis);
