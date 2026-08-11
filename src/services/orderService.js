const dummyOrders = [];

export function processNewOrder(orderData) {
  const newOrder = {
    id: `ORD-${Date.now()}`,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    ...orderData,
  };
  dummyOrders.push(newOrder);
  return newOrder;
}

export function listOrders() {
  return dummyOrders;
}
