const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID();
localStorage.setItem('deviceId', deviceId);

const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
const socket = new WebSocket(`${protocol}://${location.host}/chat`);

const messagesDiv = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');

socket.onopen = () => {
  socket.send(JSON.stringify({ event: 'init', data: { deviceId } }));
};

socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'botMessage') {
    renderBotMessage(msg.data);
  }

  if (msg.type === 'paymentRequired') {
    showPaystackPopup(msg);
  }

  if (msg.type === 'deviceId') {
    localStorage.setItem('deviceId', msg.deviceId);
  }
};

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  addUserMessage(text);
  socket.send(JSON.stringify({ event: 'message', data: { text } }));
  messageInput.value = '';
});

// ----- MESSAGE RENDERING -----

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user';
  div.textContent = text;
  messagesDiv.appendChild(div);
  scrollToBottom();
}

function addBotText(text) {
  const div = document.createElement('div');
  div.className = 'message bot';
  div.textContent = text;
  messagesDiv.appendChild(div);
  scrollToBottom();
}

function renderBotMessage(data) {
  console.log('🎨 Frontend renderBotMessage received:', data.type, data);
  // Show the text part (if any)
  if (data.text) {
    addBotText(data.text);
  }

  // Render based on type
  switch (data.type) {
    case 'mainMenu':
      renderButtons(data.buttons, 'mainMenu');
      break;
    case 'menuList':
      renderMenuItems(data.items);
      if (data.buttons) renderButtons(data.buttons, 'menuList');
      break;
    case 'quantityInput':
      renderQuantityInput(data.itemName);
      break;
    case 'checkout':
      renderOrderSummary(data.orderSummary);
      break;
    case 'orderSummary':
      renderOrderSummary(data.orderSummary);
      if (data.buttons) renderButtons(data.buttons, 'orderSummary');
      break;
    case 'orderHistory':
      renderOrderHistory(data.orders);
      if (data.buttons) renderButtons(data.buttons, 'orderHistory');
      break;
    default:
      // simple text already shown, or unknown type
      break;
  }

  scrollToBottom();
}

// ----- UI COMPONENT BUILDERS -----

function renderButtons(buttons, source) {
  const btnContainer = document.createElement('div');
  btnContainer.className = 'btn-container';

  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = 'chat-btn';
    button.textContent = btn.label;
    button.addEventListener('click', () => {
      // Send the id as if the user typed it
      addUserMessage(btn.id);
      socket.send(JSON.stringify({ event: 'message', data: { text: btn.id } }));
      // Remove buttons so they can't be clicked again
      btnContainer.remove();
    });
    btnContainer.appendChild(button);
  });

  messagesDiv.appendChild(btnContainer);
}

function renderMenuItems(items) {
  const container = document.createElement('div');
  container.className = 'menu-container';

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.innerHTML = `
      <div class="menu-item-name">${item.name}</div>
      <div class="menu-item-price">₦${(item.price / 100).toFixed(2)}</div>
      <div class="menu-item-desc">${item.description || ''}</div>
    `;
    card.addEventListener('click', () => {
      addUserMessage(item.id);
      socket.send(JSON.stringify({ event: 'message', data: { text: item.id } }));
      // Disable all cards in this container to prevent multiple selections
      container.querySelectorAll('.menu-card').forEach(c => c.style.pointerEvents = 'none');
      container.style.opacity = '0.7';
    });
    container.appendChild(card);
  });

  messagesDiv.appendChild(container);
}

function renderQuantityInput(itemName) {
  const container = document.createElement('div');
  container.className = 'quantity-container';
  container.innerHTML = `
    <p>Enter quantity for <strong>${itemName}</strong>:</p>
    <div class="quantity-quick-btns">
      <button class="chat-btn qty-btn" data-qty="1">1</button>
      <button class="chat-btn qty-btn" data-qty="2">2</button>
      <button class="chat-btn qty-btn" data-qty="3">3</button>
      <button class="chat-btn qty-btn" data-qty="4">4</button>
      <button class="chat-btn qty-btn" data-qty="5">5</button>
    </div>
    <div style="margin-top:8px;">
      <input type="number" id="qty-input" min="1" placeholder="Or type a number" style="padding:8px; width:100%; border-radius:8px; border:1px solid #ccc;">
      <button id="qty-submit" class="chat-btn" style="margin-top:8px; width:100%;">Add to Order</button>
    </div>
  `;

  // Quick buttons
  container.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qty = btn.getAttribute('data-qty');
      addUserMessage(qty);
      socket.send(JSON.stringify({ event: 'message', data: { text: qty } }));
      container.remove();
    });
  });

  // Custom quantity submit
  container.querySelector('#qty-submit').addEventListener('click', () => {
    const qty = container.querySelector('#qty-input').value;
    if (qty && parseInt(qty) > 0) {
      addUserMessage(qty);
      socket.send(JSON.stringify({ event: 'message', data: { text: qty } }));
      container.remove();
    }
  });

  messagesDiv.appendChild(container);
  scrollToBottom();
}

function renderOrderSummary(summary) {
  const container = document.createElement('div');
  container.className = 'order-summary';
  let itemsHtml = '';
  summary.items.forEach(i => {
    itemsHtml += `<div class="order-item"><span>${i.quantity}x ${i.name}</span><span>₦${(i.price * i.quantity / 100).toFixed(2)}</span></div>`;
  });
  container.innerHTML = `
    <h3>Order Summary</h3>
    ${itemsHtml}
    <div class="order-total">Total: <strong>₦${summary.total}</strong></div>
  `;
  messagesDiv.appendChild(container);
  scrollToBottom();
}

function renderOrderHistory(orders) {
  const container = document.createElement('div');
  container.className = 'history-container';
  orders.forEach(o => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div><strong>Order #${o.id}</strong> (${o.status})</div>
      <div>${o.items}</div>
      <div>Total: ${o.total}</div>
      <div>Date: ${o.date}</div>
    `;
    container.appendChild(card);
  });
  messagesDiv.appendChild(container);
  scrollToBottom();
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ----- PAYSTACK (unchanged, ensure V2 version) -----
function showPaystackPopup(data) {
  if (typeof PaystackPop === 'undefined') {
    addBotText('⚠️ Payment system not loaded. Please disable ad-blocker or refresh.');
    return;
  }
  try {
    const paystack = new PaystackPop();
    paystack.newTransaction({
      key: data.publicKey,
      email: data.email,
      amount: data.amount,
      currency: 'NGN',
      ref: data.reference,
      onSuccess: (transaction) => {
        socket.send(JSON.stringify({
          event: 'paymentSuccess',
          data: { 
            reference: transaction.reference, 
            orderId: data.orderId 
          }
        }));
        addBotText('Payment successful! Verifying...');
      },
      onCancel: () => {
        addBotText('Payment cancelled. You can try again.');
      },
      onError: (error) => {
        console.error('Paystack error:', error);
        addBotText('Payment failed. Please try again.');
      }
    });
  } catch (err) {
    console.error('Paystack setup error:', err);
    addBotText('Could not open payment window. Please try again.');
  }
}