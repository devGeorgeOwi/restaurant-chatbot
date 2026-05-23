// Device ID: used to identify the chat session without login
const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID();
localStorage.setItem('deviceId', deviceId);

// Connect to the NestJS WebSocket gateway
const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
const socket = new WebSocket(`${protocol}://${location.host}/chat`);

const messagesDiv = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');

// When WebSocket opens, send init with deviceId
socket.onopen = () => {
  socket.send(JSON.stringify({ event: 'init', data: { deviceId } }));
};

// Handle messages from server
socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'botMessage') {
    addMessage(msg.message, 'bot');

    // If the bot wants us to show Paystack popup
    if (msg.paymentRequired) {
      showPaystackPopup(msg);
    }
  }

  // Received deviceId confirmation (store it)
  if (msg.type === 'deviceId') {
    localStorage.setItem('deviceId', msg.deviceId);
  }

  // Explicit payment required message (in case it comes separately)
  if (msg.type === 'paymentRequired') {
    showPaystackPopup(msg);
  }
};

// Send user message
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  socket.send(JSON.stringify({ event: 'message', data: { text } }));
  messageInput.value = '';
});

// Add a message bubble to the chat
function addMessage(text, sender) {
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  div.innerText = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Launch Paystack inline popup
function showPaystackPopup(data) {
  console.log('💸 Paystack Data:', data);  // temporary
  const handler = PaystackPop.setup({
    key: data.publicKey,       // sent from backend (test public key)
    email: data.email,
    amount: data.amount,
    currency: 'NGN',       // in kobo
    ref: data.orderId,         // using order ID as reference
    callback: function(response) {
      // After payment attempt, tell server to verify
      socket.send(JSON.stringify({
        event: 'paymentSuccess',
        data: {
          reference: response.reference,
          orderId: data.orderId
        }
      }));
      // The server will then confirm success and send a botMessage
    },
    onClose: function() {
      alert('Payment window closed. You can try again.');
    }
  });
  handler.openIframe();
}