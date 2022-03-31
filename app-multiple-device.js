const { Client, List, Buttons, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs-extra')
const { phoneNumberFormatter } = require('./helpers/formatter');
const axios = require('axios');
const mime = require('mime-types');
const config = require('./model/db');
const connection= config.connection

const port = process.env.PORT || 2086;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

app.get('/', (req, res) => {
  res.sendFile('index-multiple-device.html', {
    root: __dirname
  });
});

const sessions = [];
const SESSIONS_FILE = './whatsapp-sessions.json';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const createSessionsFileIfNotExists = function() {
  if (!fs.existsSync(SESSIONS_FILE)) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
      console.log('O ARQUIVO DE SESSÃO FOI CRIADO COM SUCESSO.');
    } catch(err) {
      console.log('FALHA AO CRIAR O ARQUIVO DE SESSÃO: ', err);
    }
  }
}

createSessionsFileIfNotExists();

const setSessionsFile = function(sessions) {
  fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function(err) {
    if (err) {
      console.log("Falha ao setar a sessão!");
    }
  });
}

const getSessionsFile = function() {
  if (SESSIONS_FILE.length >= 2) {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE));
  }else{
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
  }
}

async function checkRegisteredNumber(number, client) {
 const isRegistered = await client.isRegisteredUser(number);
 return isRegistered;
}

function clientSession(sender) {
  return sessions.find(sess => sess.id == sender).client;

}

const replacerFunc = () => {
  const visited = new WeakSet();
  return (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (visited.has(value)) {
        return;
      }
      visited.add(value);
    }
    return value;
  };
};


const createSession = async function(id, name, auth) {
  await sleep(1000); 
  console.log('Criando a sessão de: ' + name);
  const SESSION_FILE_PATH = `./whatsapp-session-${id}.json`;
  let sessionCfg;
  if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: id}),
    qrMaxRetries: 5,
    // userAgent: "",
    puppeteer: {
      headless: true,
      args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
        '--single-process', // <- this one doesn't works in Windows
        '--disable-gpu'
        ],
      },
      session: sessionCfg
    });

  client.initialize();


  if (client) {
    const dataPath = client.authStrategy.userDataDir;
    const revendaID = client.authStrategy.clientId;

    // Menambahkan session ke file
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);


    if (sessionIndex == -1) {
      savedSessions.push({
        id: id,
        name: name,
        auth: auth,
        path: dataPath,
        ready: false,
      });
      setSessionsFile(savedSessions);
    }

    sessions.push({
      id: id,
      name: name,
      auth: auth,
      path: dataPath,
      client: client
    });
  }




  client.on('message', message => {
    if(message.body === 'Revendedor') {
      client.sendMessage(message.from, 'Menu do revendedor');
    }else if(message.body === 'Cliente'){
      client.sendMessage(message.from, 'Menu do cliente');
    }
  });



  client.on('qr', (qr) => {

    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

    const sessionsIndex = sessions.findIndex(sess => sess.id == id);

    console.log('QR RECEBIDO PARA '+name+' =========> ', qr);
    if ((sessionIndex != -1)) {

      var obj = savedSessions[sessionIndex];

      if (obj) {
        if (!obj.ready) {
          qrcode.toDataURL(qr, (err, url) => {
            io.emit('qr', { id: id, src: url });
          });
        }else{
          sessions.splice(sessionsIndex, 1);
          savedSessions.splice(sessionIndex, 1);
          setSessionsFile(savedSessions);
          io.emit('checked', { id: id, text: 'Aguardando QR CODE para o scan', session: true, ready: false });
          createSession(id, name, auth);
        }
      }
    }
  });



  client.on('authenticated', (session) => {
    console.log('Cliente Autenticado: ' + name);
    const sessionsIndex = sessions.findIndex(sess => sess.id == id);
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(sessions[sessionsIndex], replacerFunc()), function(err) {
      if (err) {
        console.error(err);
      }
    });
  });



  client.on('auth_failure', function(session) {
    console.log('Autenticação falhou: ' + name);
    io.emit('message', { id: id, text: '<i class="fa-solid fa-triangle-exclamation"></i> Falha de autenticação, reiniciando...', color: "warning" });
  });



  client.on('ready', () => {
    io.emit('ready', { id: id });

    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

    if (sessionIndex != -1) {
      var obj = savedSessions[sessionIndex];

      if (obj) {
        if (!obj.ready) {
          savedSessions[sessionIndex].ready = true;
          setSessionsFile(savedSessions);
          console.log('Cliente se conectou: ' + name);
          io.emit('checked', { id: id, text: 'O seu whatsapp está conectado!', session: true, ready: true });
        }else{
          console.log('Cliente se conectou: ' + name);
          io.emit('checked', { id: id, text: 'O seu whatsapp está conectado!', session: true, ready: true });
        }
      }
    }
  });
}

function deletedSession (id, name) {
  console.log('Deletando sessão: ' + name);
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

  if (sessionIndex != -1) {
    if (fs.existsSync('./whatsapp-session-'+id+'.json')) {
      fs.unlink('./whatsapp-session-'+id+'.json', function(err) {

        const sessionsIndex = sessions.findIndex(sess => sess.id == id);

        if ((sessionsIndex != -1)) {
          const client = clientSession(id);
          if (savedSessions[sessionIndex].ready) {
            if (client.logout()) {
              sessions.splice(sessionsIndex, 1);
              savedSessions.splice(sessionIndex, 1);
              setSessionsFile(savedSessions);
              console.log('Desconectou do @whatsapp-js: ' + name);
            }else{
              sessions.splice(sessionsIndex, 1);
              savedSessions.splice(sessionIndex, 1);
              setSessionsFile(savedSessions);
            }
          }else{
            sessions.splice(sessionsIndex, 1);
            savedSessions.splice(sessionIndex, 1);
            setSessionsFile(savedSessions);
            console.log('Desconectou do @whatsapp-js: ' + name);
          }
        }


        if(err && err.code == 'ENOENT') {
          io.emit('checked', { id: id, text: 'Essa sessão não existe', result: false });
        } else if (err) {
          io.emit('checked', { id: id, text: 'Houve um erro: '+err+' ', result: false });
        } else {
          console.log('O whatsapp foi/está desconectado: ' + name);
          io.emit('checked', { id: id, text: 'O whatsapp foi/está desconectado!', result: false });
        } 
      });
    }else{
      if (sessionIndex != -1) {
        const sessionsIndex = sessions.findIndex(sess => sess.id == id);

        if (sessionsIndex != -1) {
          console.log('Desconectou do @whatsapp-js: ' + name);
          sessions.splice(sessionsIndex, 1);
          savedSessions.splice(sessionIndex, 1);
          setSessionsFile(savedSessions);
          console.log('O whatsapp foi/está desconectado: ' + name);
          io.emit('checked', { id: id, text: 'O whatsapp foi/está desconectado!', result: false });
        }

      }else{
        console.log('O whatsapp foi/está desconectado: ' + name);
        io.emit('checked', { id: id, text: 'O whatsapp foi/está desconectado!', result: false });
      }
    }
  }else{
    console.log('O whatsapp foi/está desconectado: ' + name);
    io.emit('checked', { id: id, text: 'O whatsapp foi/está desconectado!', result: false });
  }
}

const init = function(socket, id) {
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

  if (savedSessions.length > 0) {
    if (socket) {
      socket.emit('init', savedSessions[sessionIndex]);
    } else {
      savedSessions.forEach(sess => {
        createSession(sess.id, sess.name, sess.auth);
      });
    }
  }else{
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
    if (socket) {
      socket.emit('init', savedSessions[sessionIndex]);
    } else {
      savedSessions.forEach(sess => {
        createSession(sess.id, sess.name, sess.auth);
      });
    }
  }
}

init();

// Socket IO
io.on('connection', function(socket) {



  socket.on('create-session', function(data) {
    connection.query ('select * from revendedores WHERE id = '+data.id+' ', function(error, results){
      if (results[0]){
        var dadosRevenda = results[0];

        var tokenMYSQL = dadosRevenda.token_session;
        var idMYSQL = dadosRevenda.id;

        var tokenRecebido = data.auth;
        var nomeRecebido  = data.name;
        var idRecebido    = data.id; 

        if (tokenMYSQL == tokenRecebido) {
          createSession(idRecebido, nomeRecebido, tokenRecebido);
          init(socket, idRecebido);
          console.log('Sessão criada de: ' + nomeRecebido);
        }

      }
    });
  });



  socket.on('logout-session', function(data) {

    console.log('Sessão deletada de: ' + data.name);
    deletedSession(data.id, data.name);
  });



  socket.on('check-session', function(data) {
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == data.id);

    if (sessionIndex != -1) {
      var dadosSession = savedSessions[sessionIndex];
      if (dadosSession.ready) {
        io.emit('checked', { id: data.id, text: 'O seu whatsapp está conectado!', session: true, ready: true });
      }else{
        io.emit('message', { id: data.id, text: 'Você iniciou uma sessão.', color: "warning" });
        io.emit('checked', { id: data.id, text: 'Aguardando QR CODE para o scan', session: true, ready: false });
      }
    }else{
      if (savedSessions.length == 0) {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
        io.emit('checked', { id: data.id, text: 'Clique na imagem para gerar o QR', session: false, ready: false });
      }else{
        io.emit('checked', { id: data.id, text: 'Clique na imagem para gerar o QR', session: false, ready: false });
      }
    }
  });

});


// Send message
app.post('/send-message', (req, res) => {
  const sender = req.body.sender;
  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;
  const auth    = req.headers.auth;

  const client = clientSession(sender);


  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});


// Send media
app.post('/send-media', async (req, res) => {
  const sender = req.body.sender;
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file;

  let mimetype;
  const attachment = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  }).then(response => {
    mimetype = response.headers['content-type'];
    return response.data.toString('base64');
  });

  const media = new MessageMedia(mimetype, attachment, 'Media');

  const client = clientSession(sender);

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});


// Send button
app.post('/send-button', [
  body('sender').notEmpty(),
  body('number').notEmpty(),
  body('buttonBody').notEmpty(),
  body('bt1').notEmpty(),
  body('bt2').notEmpty(),
  body('bt3').notEmpty(),
  body('buttonTitle').notEmpty(),
  body('buttonFooter').notEmpty()
  
  ], async (req, res) => {
    const errors = validationResult(req).formatWith(({
      msg
    }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped()
      });
    }

    const sender = req.body.sender;
    const number = phoneNumberFormatter(req.body.number);
    const buttonBody = req.body.buttonBody;
    const bt1 = req.body.bt1;
    const bt2 = req.body.bt2;
    const bt3 = req.body.bt3;
    const buttonTitle = req.body.buttonTitle;
    const buttonFooter = req.body.buttonFooter;
    const button = new Buttons(buttonBody,[{body:bt1},{body:bt2},{body:bt3}],buttonTitle,buttonFooter);
    const client = clientSession(sender);


    const isRegisteredNumber = await checkRegisteredNumber(number, client);

    if (!isRegisteredNumber) {
      return res.status(422).json({
        status: false,
        message: 'The number is not registered'
      });
    }

    client.sendMessage(number, button).then(response => {
      res.status(200).json({
        status: true,
        response: response
      });
    }).catch(err => {
      res.status(500).json({
        status: false,
        response: err
      });
    });
  });


// Send List
app.post('/send-list', [
  body('sender').notEmpty(),
  body('number').notEmpty(),
  body('ListItem1').notEmpty(),
  body('desc1').notEmpty(),
  body('ListItem2').notEmpty(),
  body('desc2').notEmpty(),
  body('List_body').notEmpty(),
  body('btnText').notEmpty(),
  body('Title').notEmpty(),
  body('footer').notEmpty()
  
  ], async (req, res) => {
    const errors = validationResult(req).formatWith(({
      msg
    }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped()
      });
    }

    const sender = req.body.sender;
    const number = phoneNumberFormatter(req.body.number);
    const sectionTitle = req.body.sectionTitle;
    const ListItem1 = req.body.ListItem1;
    const desc1 = req.body.desc1;
    const ListItem2 = req.body.ListItem2;
    const desc2 = req.body.desc2;
    const List_body = req.body.List_body;
    const btnText = req.body.btnText;
    const Title = req.body.Title;
    const footer = req.body.footer;

    const sections = [{title:sectionTitle,rows:[{title:ListItem1, description: desc1},{title:ListItem2, description: desc2}]}];
    const list = new List(List_body,btnText,sections,Title,footer);

    const client = clientSession(sender);

    
    const isRegisteredNumber = await checkRegisteredNumber(number, client);

    if (!isRegisteredNumber) {
      return res.status(422).json({
        status: false,
        message: 'The number is not registered'
      });
    }


    client.sendMessage(number, list).then(response => {
      res.status(200).json({
        status: true,
        response: response
      });
    }).catch(err => {
      res.status(500).json({
        status: false,
        response: err
      });
    });
  });

server.listen(port, function() {
  console.log('API RODANDO NA PORTA: ' + port);
});
