import streamlit as st
import csv
import os.path

def collect_user_data():
    st.title("User Data Collection Form")

    # Collect user input
    name = st.text_input("Name")
    locality = st.text_input("Locality")
    phone_number = st.text_input("Phone Number")
    first_time = st.radio("First time at our shop?", options=["Yes", "No"])

    if st.button("Submit"):
        # Define the CSV file path
        csv_file = "user_data.csv"

        # Check if the file exists, if not create it and write the header row
        if not os.path.isfile(csv_file):
            with open(csv_file, "w", newline='') as file:
                writer = csv.writer(file)
                writer.writerow(["Name", "Locality", "Phone Number", "First Time"])

        # Append the collected data to the CSV file
        with open(csv_file, "a", newline='') as file:
            writer = csv.writer(file)
            writer.writerow([name, locality, phone_number, first_time])
        st.success("Data submitted successfully!")

if __name__ == "__main__":
    collect_user_data()
