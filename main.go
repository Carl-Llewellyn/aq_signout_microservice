package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/cors"
	"github.com/vmihailenco/msgpack/v5"
	"gitlab.com/UrsusArcTech/logger"
)

var db *pgxpool.Pool

type AQ struct {
	AQ                       string     `msgpack:"aq"`
	SignoutName              *string    `msgpack:"signout_name"`
	ProgID                   *int       `msgpack:"prog_id"`
	MigratoryGroup           *string    `msgpack:"migratory_group"`
	CruiseID                 *string    `msgpack:"cruise_id"`
	Comments                 *string    `msgpack:"comments"`
	SampleTypes              *string    `msgpack:"sample_types"`
	Trip                     *string    `msgpack:"trip"`
	TripLocation             *string    `msgpack:"trip_location"`
	MglLead                  *string    `msgpack:"mgl_lead"`
	MglSamplers              *string    `msgpack:"mgl_samplers"`
	ChiefScientist           *string    `msgpack:"chief_scientist"`
	Target                   *string    `msgpack:"target"`
	CommentsCollectionMethod *string    `msgpack:"comments_collection_method"`
	VialSeries               *string    `msgpack:"vial_series"`
	CommentsVialSeries       *string    `msgpack:"comments_vial_series"`
	StartDate                *time.Time `msgpack:"start_date"`
	EndDate                  *time.Time `msgpack:"end_date"`
	DateAdded                *time.Time `msgpack:"date_added"`
	DateUpdated              *time.Time `msgpack:"date_updated"`
	ChiefScientistID         *int64     `msgpack:"chief_scientist_id"`
}

func LogFatal(msg string) {
	log.Fatal(msg)
}

func main() {
	dsn := os.Getenv("DB_URL")
	if dsn == "" {
		LogFatal("DB_URL not set")
	}
	var err error
	db, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatalf("failed to connect to db: %v", err)
	}
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/aq/list", handleListAQ)
	mux.HandleFunc("/aq/get", handleGetAQ)
	mux.HandleFunc("/aq/create", handleCreateAQ)
	mux.HandleFunc("/aq/update", handleUpdateAQ)
	mux.HandleFunc("/aq/delete", handleDeleteAQ)
	mux.Handle("/", http.FileServer(http.Dir("static")))

	handler := cors.AllowAll().Handler(mux)
	log.Println("Listening on :8085")
	log.Fatal(http.ListenAndServe(":8085", handler))
}

// Helper functions for scanning nulls
func scanString(s *string) interface{}  { return &sql.NullString{} }
func scanInt(i *int) interface{}        { return &sql.NullInt32{} }
func scanInt64(i *int64) interface{}    { return &sql.NullInt64{} }
func scanTime(t *time.Time) interface{} { return &sql.NullTime{} }

func handleListAQ(w http.ResponseWriter, r *http.Request) {
	aqSearch := r.URL.Query().Get("aq")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit := 50
	offset := 0
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 1000 {
			limit = l
		}
	}
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	query := `SELECT aq, signout_name, prog_id, migratory_group, cruise_id, comments, sample_types, trip, trip_location, mgl_lead, mgl_samplers, chief_scientist, target, comments_collection_method, vial_series, comments_vial_series, start_date, end_date, date_added, date_updated, chief_scientist_id
        FROM mgl.aq`
	args := []interface{}{}
	where := ""
	if aqSearch != "" {
		where = " WHERE aq ILIKE $1"
		args = append(args, "%"+aqSearch+"%")
	}
	query += where + " ORDER BY aq LIMIT $" + strconv.Itoa(len(args)+1) + " OFFSET $" + strconv.Itoa(len(args)+2)
	args = append(args, limit, offset)

	rows, err := db.Query(context.Background(), query, args...)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()
	var results []AQ
	for rows.Next() {
		var aq AQ
		var progID sql.NullInt32
		var chiefID sql.NullInt64
		var signoutName, migratoryGroup, cruiseID, comments, sampleTypes, trip, tripLocation, mglLead, mglSamplers, chiefScientist, target, commentsCollectionMethod, vialSeries, commentsVialSeries sql.NullString
		var startDate, endDate, dateAdded, dateUpdated sql.NullTime
		err := rows.Scan(
			&aq.AQ, &signoutName, &progID, &migratoryGroup, &cruiseID, &comments, &sampleTypes, &trip, &tripLocation, &mglLead, &mglSamplers, &chiefScientist, &target, &commentsCollectionMethod, &vialSeries, &commentsVialSeries, &startDate, &endDate, &dateAdded, &dateUpdated, &chiefID,
		)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		aq.SignoutName = nullStringToPtr(signoutName)
		aq.ProgID = nullInt32ToPtr(progID)
		aq.MigratoryGroup = nullStringToPtr(migratoryGroup)
		aq.CruiseID = nullStringToPtr(cruiseID)
		aq.Comments = nullStringToPtr(comments)
		aq.SampleTypes = nullStringToPtr(sampleTypes)
		aq.Trip = nullStringToPtr(trip)
		aq.TripLocation = nullStringToPtr(tripLocation)
		aq.MglLead = nullStringToPtr(mglLead)
		aq.MglSamplers = nullStringToPtr(mglSamplers)
		aq.ChiefScientist = nullStringToPtr(chiefScientist)
		aq.Target = nullStringToPtr(target)
		aq.CommentsCollectionMethod = nullStringToPtr(commentsCollectionMethod)
		aq.VialSeries = nullStringToPtr(vialSeries)
		aq.CommentsVialSeries = nullStringToPtr(commentsVialSeries)
		aq.StartDate = nullTimeToPtr(startDate)
		aq.EndDate = nullTimeToPtr(endDate)
		aq.DateAdded = nullTimeToPtr(dateAdded)
		aq.DateUpdated = nullTimeToPtr(dateUpdated)
		aq.ChiefScientistID = nullInt64ToPtr(chiefID)
		results = append(results, aq)
	}
	w.Header().Set("Content-Type", "application/x-msgpack")
	msgpack.NewEncoder(w).Encode(results)
}

func handleGetAQ(w http.ResponseWriter, r *http.Request) {
	aqKey := r.URL.Query().Get("aq")
	if aqKey == "" {
		http.Error(w, "Missing aq param", 400)
		return
	}
	row := db.QueryRow(context.Background(), `SELECT aq, signout_name, prog_id, migratory_group, cruise_id, comments, sample_types, trip, trip_location, mgl_lead, mgl_samplers, chief_scientist, target, comments_collection_method, vial_series, comments_vial_series, start_date, end_date, date_added, date_updated, chief_scientist_id FROM mgl.aq WHERE aq=$1`, aqKey)
	var aq AQ
	var progID sql.NullInt32
	var chiefID sql.NullInt64
	var signoutName, migratoryGroup, cruiseID, comments, sampleTypes, trip, tripLocation, mglLead, mglSamplers, chiefScientist, target, commentsCollectionMethod, vialSeries, commentsVialSeries sql.NullString
	var startDate, endDate, dateAdded, dateUpdated sql.NullTime
	err := row.Scan(
		&aq.AQ, &signoutName, &progID, &migratoryGroup, &cruiseID, &comments, &sampleTypes, &trip, &tripLocation, &mglLead, &mglSamplers, &chiefScientist, &target, &commentsCollectionMethod, &vialSeries, &commentsVialSeries, &startDate, &endDate, &dateAdded, &dateUpdated, &chiefID,
	)
	if err != nil {
		http.Error(w, err.Error(), 404)
		return
	}
	aq.SignoutName = nullStringToPtr(signoutName)
	aq.ProgID = nullInt32ToPtr(progID)
	aq.MigratoryGroup = nullStringToPtr(migratoryGroup)
	aq.CruiseID = nullStringToPtr(cruiseID)
	aq.Comments = nullStringToPtr(comments)
	aq.SampleTypes = nullStringToPtr(sampleTypes)
	aq.Trip = nullStringToPtr(trip)
	aq.TripLocation = nullStringToPtr(tripLocation)
	aq.MglLead = nullStringToPtr(mglLead)
	aq.MglSamplers = nullStringToPtr(mglSamplers)
	aq.ChiefScientist = nullStringToPtr(chiefScientist)
	aq.Target = nullStringToPtr(target)
	aq.CommentsCollectionMethod = nullStringToPtr(commentsCollectionMethod)
	aq.VialSeries = nullStringToPtr(vialSeries)
	aq.CommentsVialSeries = nullStringToPtr(commentsVialSeries)
	aq.StartDate = nullTimeToPtr(startDate)
	aq.EndDate = nullTimeToPtr(endDate)
	aq.DateAdded = nullTimeToPtr(dateAdded)
	aq.DateUpdated = nullTimeToPtr(dateUpdated)
	aq.ChiefScientistID = nullInt64ToPtr(chiefID)

	w.Header().Set("Content-Type", "application/x-msgpack")
	msgpack.NewEncoder(w).Encode(aq)
}

func handleCreateAQ(w http.ResponseWriter, r *http.Request) {
	var aq AQ
	err := msgpack.NewDecoder(r.Body).Decode(&aq)
	if err != nil {
		http.Error(w, "Invalid msgpack", 400)
		return
	}
	_, err = db.Exec(
		context.Background(),
		`INSERT INTO mgl.aq (
			aq, signout_name, prog_id, migratory_group, cruise_id, comments, sample_types, trip, trip_location, mgl_lead, mgl_samplers, chief_scientist, target, comments_collection_method, vial_series, comments_vial_series, start_date, end_date, date_added, date_updated, chief_scientist_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),now(),$19)`,
		aq.AQ, aq.SignoutName, aq.ProgID, aq.MigratoryGroup, aq.CruiseID, aq.Comments, aq.SampleTypes, aq.Trip, aq.TripLocation, aq.MglLead, aq.MglSamplers, aq.ChiefScientist, aq.Target, aq.CommentsCollectionMethod, aq.VialSeries, aq.CommentsVialSeries, aq.StartDate, aq.EndDate, aq.ChiefScientistID,
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func handleUpdateAQ(w http.ResponseWriter, r *http.Request) {
	var aq AQ
	err := msgpack.NewDecoder(r.Body).Decode(&aq)
	if err != nil {
		logger.LogError(err.Error())
		http.Error(w, "Invalid msgpack", 400)
		return
	}
	_, err = db.Exec(
		context.Background(),
		`UPDATE mgl.aq SET signout_name=$2, prog_id=$3, migratory_group=$4, cruise_id=$5, comments=$6, sample_types=$7, trip=$8, trip_location=$9, mgl_lead=$10, mgl_samplers=$11, chief_scientist=$12, target=$13, comments_collection_method=$14, vial_series=$15, comments_vial_series=$16, start_date=$17, end_date=$18, date_updated=now(), chief_scientist_id=$19 WHERE aq=$1`,
		aq.AQ, aq.SignoutName, aq.ProgID, aq.MigratoryGroup, aq.CruiseID, aq.Comments, aq.SampleTypes, aq.Trip, aq.TripLocation, aq.MglLead, aq.MglSamplers, aq.ChiefScientist, aq.Target, aq.CommentsCollectionMethod, aq.VialSeries, aq.CommentsVialSeries, aq.StartDate, aq.EndDate, aq.ChiefScientistID,
	)
	if err != nil {
		logger.LogError(err.Error())
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func handleDeleteAQ(w http.ResponseWriter, r *http.Request) {
	aqKey := r.URL.Query().Get("aq")
	if aqKey == "" {
		http.Error(w, "Missing aq param", 400)
		return
	}
	_, err := db.Exec(context.Background(), "DELETE FROM mgl.aq WHERE aq=$1", aqKey)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// Helper null conversion
func nullStringToPtr(ns sql.NullString) *string {
	if ns.Valid {
		return &ns.String
	}
	return nil
}
func nullInt32ToPtr(ni sql.NullInt32) *int {
	if ni.Valid {
		val := int(ni.Int32)
		return &val
	}
	return nil
}
func nullInt64ToPtr(ni sql.NullInt64) *int64 {
	if ni.Valid {
		return &ni.Int64
	}
	return nil
}
func nullTimeToPtr(nt sql.NullTime) *time.Time {
	if nt.Valid {
		return &nt.Time
	}
	return nil
}
