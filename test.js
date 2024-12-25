const axios = require("axios");

(async () => {
  const axios = require('axios');

  axios.get('https://socialblade.com/youtube/channel/UC5dZFJ-cjLBZB_Q4qUiCvug', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'PHPSESSXX=8a2fbgu7ckrjd7fu6koik70658'
    }
  }).then(response => {
    console.log(response.data);
  }).catch(error => {
    console.error(error);
  });
})();
