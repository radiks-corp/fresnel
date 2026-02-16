# Sentry Quick Reference

Quick copy-paste examples for using Sentry in your code.

## Import Statements

### Frontend (React)
```javascript
import { Sentry } from './sentry';
```

### Backend (Node/Express)
```typescript
import { Sentry } from './instrument.js';
```

### Electron Main Process
```javascript
const Sentry = require("@sentry/electron/main");
```

### Electron Renderer Process
```javascript
// Use React SDK instead (already configured in src/sentry.js)
import { Sentry } from './sentry';
```

## Error Tracking

### Basic Error Capture
```javascript
try {
  riskyOperation();
} catch (error) {
  Sentry.captureException(error);
  // Still handle the error in your app
}
```

### With Context
```javascript
try {
  await processPayment(userId, amount);
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      payment_method: "stripe",
      environment: "production"
    },
    extra: {
      userId,
      amount,
      timestamp: new Date().toISOString()
    }
  });
}
```

## Performance Tracing

### Button Click Tracking
```javascript
function MyComponent() {
  const handleClick = () => {
    Sentry.startSpan(
      {
        op: "ui.click",
        name: "Submit Form Button",
      },
      (span) => {
        span.setAttribute("form_id", "user-registration");
        
        // Your logic here
        submitForm();
      }
    );
  };

  return <button onClick={handleClick}>Submit</button>;
}
```

### API Call Tracking
```javascript
async function fetchUserData(userId) {
  return Sentry.startSpan(
    {
      op: "http.client",
      name: `GET /api/users/${userId}`,
    },
    async (span) => {
      span.setAttribute("user_id", userId);
      
      const response = await fetch(`/api/users/${userId}`);
      
      span.setAttribute("status_code", response.status);
      
      if (!response.ok) {
        span.setAttribute("error", true);
      }
      
      return response.json();
    }
  );
}
```

### Database Query Tracking
```javascript
async function getUserById(id) {
  return Sentry.startSpan(
    {
      op: "db.query",
      name: "User.findById",
    },
    async (span) => {
      span.setAttribute("db.system", "mongodb");
      span.setAttribute("user_id", id);
      
      const user = await User.findById(id);
      
      return user;
    }
  );
}
```

### Nested Spans
```javascript
async function processOrder(orderId) {
  return Sentry.startSpan(
    {
      op: "process.order",
      name: "Process Order",
    },
    async (parentSpan) => {
      parentSpan.setAttribute("order_id", orderId);
      
      // Child span 1
      const order = await Sentry.startSpan(
        {
          op: "db.query",
          name: "Fetch Order",
        },
        () => fetchOrder(orderId)
      );
      
      // Child span 2
      const payment = await Sentry.startSpan(
        {
          op: "payment.process",
          name: "Process Payment",
        },
        () => processPayment(order.paymentId)
      );
      
      return { order, payment };
    }
  );
}
```

## Logging

### Basic Logging
```javascript
const { logger } = Sentry;

logger.info("User logged in", { userId: 123 });
logger.warn("Cache miss", { key: "user:456" });
logger.error("Payment failed", { orderId: "abc123" });
```

### With Template Literals
```javascript
const { logger } = Sentry;

const userId = 123;
const action = "purchase";

logger.debug(logger.fmt`User ${userId} performed ${action}`);
```

### Log Levels
```javascript
const { logger } = Sentry;

logger.trace("Verbose debug info");
logger.debug("Debug information");
logger.info("General information");
logger.warn("Warning - something needs attention");
logger.error("Error - something failed");
logger.fatal("Fatal - system is unusable");
```

## User Context

### Set User Information
```javascript
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.login,
});
```

### Clear User Information (on logout)
```javascript
Sentry.setUser(null);
```

## Tags and Context

### Add Tags
```javascript
Sentry.setTag("page", "dashboard");
Sentry.setTag("feature", "analytics");
```

### Add Extra Context
```javascript
Sentry.setContext("order", {
  id: "order_123",
  total: 99.99,
  items: 3
});
```

## Breadcrumbs

### Manual Breadcrumbs
```javascript
Sentry.addBreadcrumb({
  category: "auth",
  message: "User login attempted",
  level: "info",
  data: {
    email: "user@example.com",
  },
});
```

## Express Error Handler

Already configured in `backend/src/index.ts`:

```typescript
// After all routes
Sentry.setupExpressErrorHandler(app);

// Optional fallthrough handler
app.use((err, req, res, next) => {
  res.statusCode = 500;
  res.json({ 
    error: 'Internal server error',
    sentryId: res.sentry 
  });
});
```

## React Error Boundary

```javascript
import * as Sentry from "@sentry/react";

function FallbackComponent({ error, resetError }) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button onClick={resetError}>Try again</button>
    </div>
  );
}

function App() {
  return (
    <Sentry.ErrorBoundary fallback={FallbackComponent}>
      <YourApp />
    </Sentry.ErrorBoundary>
  );
}
```

## Common Patterns

### API Request with Error Handling
```javascript
async function makeApiRequest(endpoint) {
  return Sentry.startSpan(
    {
      op: "http.client",
      name: `API ${endpoint}`,
    },
    async (span) => {
      try {
        span.setAttribute("endpoint", endpoint);
        
        const response = await fetch(endpoint);
        
        span.setAttribute("status", response.status);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        return response.json();
      } catch (error) {
        span.setAttribute("error", true);
        Sentry.captureException(error, {
          tags: { endpoint },
          extra: { url: endpoint }
        });
        throw error;
      }
    }
  );
}
```

### Form Submission
```javascript
function RegistrationForm() {
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    return Sentry.startSpan(
      {
        op: "ui.form.submit",
        name: "User Registration",
      },
      async (span) => {
        try {
          const formData = new FormData(e.target);
          span.setAttribute("email", formData.get("email"));
          
          const response = await fetch("/api/register", {
            method: "POST",
            body: formData
          });
          
          if (response.ok) {
            span.setAttribute("success", true);
          } else {
            span.setAttribute("error", true);
            throw new Error("Registration failed");
          }
        } catch (error) {
          Sentry.captureException(error);
          // Show error to user
        }
      }
    );
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Async Function with Logging
```javascript
async function syncData() {
  const { logger } = Sentry;
  
  logger.info("Starting data sync");
  
  try {
    const result = await Sentry.startSpan(
      {
        op: "sync.data",
        name: "Data Synchronization",
      },
      async () => {
        // Sync logic
        return await performSync();
      }
    );
    
    logger.info("Data sync completed", { recordsProcessed: result.count });
    
  } catch (error) {
    logger.error("Data sync failed", { error: error.message });
    Sentry.captureException(error);
  }
}
```

## Best Practices

1. **Always capture exceptions** - Don't silently catch errors
2. **Add context** - Include relevant data with errors and spans
3. **Use meaningful names** - Span and operation names should be descriptive
4. **Set user context** - Help identify affected users
5. **Add breadcrumbs** - Provide context leading up to errors
6. **Use appropriate log levels** - Don't log everything as error
7. **Test in development** - Verify errors appear in Sentry
8. **Monitor performance** - Don't over-instrument; focus on key operations
