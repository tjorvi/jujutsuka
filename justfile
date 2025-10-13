[working-directory: 'backend']
run-backend:
    node ./src/index.ts

[working-directory: 'frontend']
run-frontend:
    npm run dev

# Get repository log in parseable format
repo-log:
    jj log --no-graph --template 'commit_id ++ "|" ++ description ++ "|" ++ author.name() ++ "|" ++ author.email() ++ "|" ++ author.timestamp() ++ "|" ++ parents.map(|p| p.commit_id()).join(",") ++ "\n"'
