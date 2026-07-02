const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

(async () => {
  const form = new FormData();
  form.append('jobDescription', 'We are hiring a software engineer with strong TypeScript, React, and AI tooling experience. Must have backend experience and product sense. Nice to have: Go, distributed systems, and mentoring.');
  form.append('resumes', fs.createReadStream(path.join(process.cwd(), 'Corrupted_Resume_Test.pdf')), { filename: 'candidate-a.pdf', contentType: 'application/pdf' });
  form.append('resumes', fs.createReadStream(path.join(process.cwd(), 'Corrupted_Resume_Test.pdf')), { filename: 'candidate-b.pdf', contentType: 'application/pdf' });

  const request = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/agent/run',
    method: 'POST',
    headers: form.getHeaders(),
  }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      console.log(body.slice(0, 4000));
    });
  });

  form.pipe(request);
})();
