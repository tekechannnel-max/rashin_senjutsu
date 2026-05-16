(function(global){
  'use strict';

  const loveSubtypes={
    reconciliation:{
      oracle:{
        themeTerms:['復縁','元恋人','過去','別れ','信頼','曖昧','連絡','寂しさ','懐かしさ','本気','区切り'],
        compassFallback:'まだ好きかどうかより、過去の原因へ向き合える関係かどうかが軸です。懐かしさで戻る前に、信頼を作り直せる会話ができるかが大切です。',
        messageFallback:'ここまでのあなたは、元恋人への気持ちを残しながら、もう一度信頼を作れる関係なのかをずっと感じ取ろうとしてきました。今は、懐かしさではなく、過去の原因に向き合える反応があるかが分かれ目です。',
        replacements:[
          ['ここまでのあなたは、自分なりのやり方で何とか持ちこたえてきたはずです。','ここまでのあなたは、元恋人への気持ちを残しながら、もう一度信頼を作れる関係なのかをずっと感じ取ろうとしてきました。'],
          ['一人で抱え込むより','信頼の温度を一人で想像し続けるより'],
          ['選択肢を増やしてから動く','過去の原因に向き合う反応を見る'],
          ['感情・現実の条件・'+'確認すべきこと','未練・過去の原因・信頼を作り直せる根拠']
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
