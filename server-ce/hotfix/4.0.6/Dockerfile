FROM sharelatex/sharelatex:4.0.5

# Patch: Drop the old history collections and increase mongo query timeout
ADD clean_sl_history_data.js /superpaper/services/web/scripts/history/clean_sl_history_data.js
