[working-directory: 'backend']
run-backend:
    npm run dev

[working-directory: 'frontend']
run-frontend:
    npm run dev

[working-directory: 'backend']
test-backend:
    npm test

[working-directory: 'frontend']
test-frontend:
    npm test

test: test-backend test-frontend