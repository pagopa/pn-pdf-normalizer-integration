/**
 * Example/placeholder Handler for NormalizedPDFHook Lambda.
 * Nedeed for cicd test
 */
exports.handler = async (event, context) => {
    // Log Lambda context (for debugging).
    console.log('## CTX:', JSON.stringify(context));
    // Log full ALB event (for debugging).
    console.log('## EVT:', JSON.stringify(event));
  
    // Extract basic info from ALB event.
    const httpMethod = event.httpMethod;
    const path = event.path;
    console.log(`## ${httpMethod} request for path: ${path}`);
  
  
  
    // HTTP response for ALB
    const response = {
      statusCode: 200, // OK
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Callback received successfully' }),
      isBase64Encoded: false,
    };
  
    // Log the ALB response 
    console.log('## RSP:', JSON.stringify(response));
    return response;
  };